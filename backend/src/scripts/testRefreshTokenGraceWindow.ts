import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { pool } from '../config/db.js';
import { env } from '../config/env.js';
import { initializeDatabase } from '../db/init.js';
import { AuthService } from '../services/authService.js';
import { AppHttpError } from '../utils/errors.js';
import { parseRefreshToken } from '../utils/jwt.js';
import { hashPassword } from '../utils/password.js';
import { generateUUIDv7 } from '../utils/uuid.js';

async function getSessionRow(sessionId: string) {
  const res = await pool.query(
    `SELECT id, user_id, refresh_token_hash, previous_refresh_token_hash,
            rotated_at, expires_at, revoked_at
     FROM user_sessions
     WHERE id = $1`,
    [sessionId]
  );
  return res.rows[0] as
    | {
        id: string;
        user_id: string;
        refresh_token_hash: string;
        previous_refresh_token_hash: string | null;
        rotated_at: Date | string | null;
        expires_at: Date | string;
        revoked_at: Date | string | null;
      }
    | undefined;
}

async function getTokenVersion(userId: string): Promise<number> {
  const res = await pool.query(`SELECT token_version FROM users WHERE id = $1`, [userId]);
  assert.equal(res.rows.length, 1);
  return Number(res.rows[0].token_version);
}

async function testFrontendSingleFlightMutex(): Promise<void> {
  const storageMap = new Map<string, string>();
  const mockLocalStorage = {
    getItem: (key: string) => (storageMap.has(key) ? storageMap.get(key)! : null),
    setItem: (key: string, value: string) => {
      storageMap.set(key, String(value));
    },
    removeItem: (key: string) => {
      storageMap.delete(key);
    },
    clear: () => {
      storageMap.clear();
    },
    key: (index: number) => Array.from(storageMap.keys())[index] ?? null,
    get length() {
      return storageMap.size;
    },
  };

  const originalFetch = globalThis.fetch;
  const originalLocalStorage = (globalThis as any).localStorage;
  (globalThis as any).localStorage = mockLocalStorage;

  try {
    const frontendApiUrl = pathToFileURL(
      path.resolve(process.cwd(), '../frontend/src/services/api.ts')
    ).href;
    const frontendApiModule = (await import(frontendApiUrl)) as {
      api: {
        getMe: () => Promise<any>;
        refresh: (token?: string) => Promise<any>;
      };
      ApiError: new (message: string, status: number, code?: string, details?: unknown) => Error & {
        status: number;
        code?: string;
      };
      getAuthToken: () => string | null;
      getRefreshToken: () => string | null;
      setAuthTokens: (access: string, refresh: string) => void;
      setUnauthorizedHandler: (handler: ((message?: string) => void) | null) => void;
    };

    const mockUser = {
      id: generateUUIDv7(),
      username: 'mock_gudang',
      email: null,
      full_name: 'Mock Gudang',
      role: 'gudang',
      is_active: true,
      must_change_password: false,
      last_login_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const jsonResponse = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });

    // 7a. 9 parallel 401 requests + 1 concurrent api.refresh() => tepat 1 POST /api/auth/refresh
    let refreshCallCount = 0;
    let validAccessToken = 'fresh-access-2';
    let currentRefreshToken = 'refresh-1';

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/auth/refresh')) {
        refreshCallCount += 1;
        await new Promise((r) => setTimeout(r, 40));
        const body = JSON.parse(String(init?.body || '{}'));
        assert.equal(body.refresh_token, currentRefreshToken);
        currentRefreshToken = 'refresh-2';
        return jsonResponse(200, {
          success: true,
          data: {
            access_token: validAccessToken,
            refresh_token: currentRefreshToken,
            token_type: 'Bearer',
            expires_in: 900,
            user: mockUser,
            permissions: ['products:read'],
          },
        });
      }

      if (url.endsWith('/auth/me')) {
        const authHeader = (init?.headers as Record<string, string> | undefined)?.Authorization;
        if (authHeader === `Bearer ${validAccessToken}`) {
          return jsonResponse(200, {
            success: true,
            data: { user: mockUser, permissions: ['products:read'] },
          });
        }
        return jsonResponse(401, {
          success: false,
          code: 'TOKEN_EXPIRED',
          message: 'Access token kedaluwarsa.',
        });
      }

      throw new Error(`Unexpected fetch URL in mock: ${url}`);
    }) as typeof fetch;

    let unauthorizedCount = 0;
    frontendApiModule.setUnauthorizedHandler(() => {
      unauthorizedCount += 1;
    });

    frontendApiModule.setAuthTokens('expired-access-1', 'refresh-1');
    const parallelResults = await Promise.all([
      ...Array.from({ length: 9 }, () => frontendApiModule.api.getMe()),
      frontendApiModule.api.refresh(),
    ]);

    assert.equal(parallelResults.length, 10);
    assert.equal(
      refreshCallCount,
      1,
      '10 panggilan paralel (9x 401 + 1x api.refresh) wajib menembakkan tepat 1 POST /api/auth/refresh'
    );
    assert.equal(unauthorizedCount, 0);
    assert.equal(frontendApiModule.getAuthToken(), 'fresh-access-2');
    assert.equal(frontendApiModule.getRefreshToken(), 'refresh-2');

    // 7b. Late-arriving 401 dedup: Req B menerima 401 lama SETELAH Req A selesai refresh -> tidak memicu refresh ke-2
    let batch2RefreshCalls = 0;
    let meCallIdx = 0;
    validAccessToken = 'fresh-access-3';
    currentRefreshToken = 'refresh-2';

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/auth/refresh')) {
        batch2RefreshCalls += 1;
        await new Promise((r) => setTimeout(r, 15));
        currentRefreshToken = 'refresh-3';
        return jsonResponse(200, {
          success: true,
          data: {
            access_token: validAccessToken,
            refresh_token: currentRefreshToken,
            token_type: 'Bearer',
            expires_in: 900,
            user: mockUser,
            permissions: ['products:read'],
          },
        });
      }
      if (url.endsWith('/auth/me')) {
        const authHeader = (init?.headers as Record<string, string> | undefined)?.Authorization;
        if (authHeader === `Bearer ${validAccessToken}`) {
          return jsonResponse(200, {
            success: true,
            data: { user: mockUser, permissions: ['products:read'] },
          });
        }
        meCallIdx += 1;
        if (meCallIdx === 2) {
          // Sengaja tunda 401 kedua hingga refresh pertama sudah selesai & inFlightRefreshPromise = null
          await new Promise((r) => setTimeout(r, 90));
        }
        return jsonResponse(401, {
          success: false,
          code: 'TOKEN_EXPIRED',
          message: 'Access token kedaluwarsa.',
        });
      }
      throw new Error(`Unexpected fetch URL in mock: ${url}`);
    }) as typeof fetch;

    frontendApiModule.setAuthTokens('expired-access-2', 'refresh-2');
    await Promise.all([frontendApiModule.api.getMe(), frontendApiModule.api.getMe()]);
    assert.equal(
      batch2RefreshCalls,
      1,
      'Late-arriving 401 harus memakai access token terbaru di storage tanpa memicu POST /auth/refresh kedua'
    );
    assert.equal(frontendApiModule.getAuthToken(), 'fresh-access-3');
    assert.equal(frontendApiModule.getRefreshToken(), 'refresh-3');

    // 7c. Offline / TypeError & 503 saat refresh TIDAK boleh menghapus refresh_token atau memicu unauthorizedHandler
    frontendApiModule.setAuthTokens('expired-access-3', 'refresh-3');
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/refresh')) {
        throw new TypeError('Failed to fetch');
      }
      return jsonResponse(401, {
        success: false,
        code: 'TOKEN_EXPIRED',
        message: 'Access token kedaluwarsa.',
      });
    }) as typeof fetch;

    await assert.rejects(() => frontendApiModule.api.getMe(), TypeError);
    assert.equal(unauthorizedCount, 0, 'Network drop saat refresh tidak boleh memicu paksa logout');
    assert.equal(
      frontendApiModule.getRefreshToken(),
      'refresh-3',
      'refresh_token lokal wajib tetap terjaga saat Wi-Fi putus sementara'
    );

    // 503 Service Unavailable saat refresh juga tidak boleh menghapus refresh_token
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/refresh')) {
        return jsonResponse(503, {
          success: false,
          message: 'Server sedang restart.',
        });
      }
      return jsonResponse(401, {
        success: false,
        code: 'TOKEN_EXPIRED',
        message: 'Access token kedaluwarsa.',
      });
    }) as typeof fetch;

    await assert.rejects(
      () => frontendApiModule.api.getMe(),
      (err: any) => err?.status === 503
    );
    assert.equal(unauthorizedCount, 0, '503 saat refresh tidak boleh memicu paksa logout');
    assert.equal(frontendApiModule.getRefreshToken(), 'refresh-3');

    // 401 TOKEN_REPLAY_DETECTED dari /auth/refresh WAJIB membersihkan token dan memicu unauthorizedHandler
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/auth/refresh')) {
        return jsonResponse(401, {
          success: false,
          code: 'TOKEN_REPLAY_DETECTED',
          message: 'Refresh token telah digunakan atau tidak valid.',
        });
      }
      return jsonResponse(401, {
        success: false,
        code: 'TOKEN_EXPIRED',
        message: 'Access token kedaluwarsa.',
      });
    }) as typeof fetch;

    await assert.rejects(
      () => frontendApiModule.api.getMe(),
      (err: any) => err?.status === 401 && err?.code === 'TOKEN_REPLAY_DETECTED'
    );
    assert.equal(unauthorizedCount, 1, '401 dari /auth/refresh harus memicu unauthorizedHandler 1x');
    assert.equal(frontendApiModule.getRefreshToken(), null, 'refresh_token harus dihapus saat 401');
    assert.equal(frontendApiModule.getAuthToken(), null, 'access_token harus dihapus saat 401');

    frontendApiModule.setUnauthorizedHandler(null);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalLocalStorage === undefined) {
      delete (globalThis as any).localStorage;
    } else {
      (globalThis as any).localStorage = originalLocalStorage;
    }
  }
}

async function runTests() {
  console.log('🧪 Memulai pengujian Issue #4: Refresh Token Grace Window & Single-Flight Mutex...');
  await initializeDatabase();

  assert.ok(
    env.jwtRefreshGraceWindowSeconds >= 10 && env.jwtRefreshGraceWindowSeconds <= 60,
    `Grace window default harus berada pada rentang wajar (aktual: ${env.jwtRefreshGraceWindowSeconds}s)`
  );

  const testUserId = generateUUIDv7();
  const testUsername = `test_refresh_grace_${Date.now()}`;
  const initialPassword = 'TestPassword#123';
  const passwordHash = await hashPassword(initialPassword);

  await pool.query(
    `INSERT INTO users (id, username, full_name, password_hash, role, is_active, must_change_password)
     VALUES ($1, $2, 'Test Grace Window User', $3, 'gudang', TRUE, FALSE)`,
    [testUserId, testUsername, passwordHash]
  );

  try {
    // =========================================================================
    // 1. Login & Rotasi Normal (simpan previous_refresh_token_hash + rotated_at)
    // =========================================================================
    const loginRes = await AuthService.login(testUsername, initialPassword, {
      userAgent: 'TestSuite/1.0',
      ipAddress: '127.0.0.1',
    });
    const parsedT1 = parseRefreshToken(loginRes.refresh_token);
    assert.ok(parsedT1, 'Refresh token awal harus valid');

    const initialRow = await getSessionRow(parsedT1.sessionId);
    assert.ok(initialRow);
    assert.equal(initialRow.previous_refresh_token_hash, null);
    assert.equal(initialRow.rotated_at, null);

    const rot1 = await AuthService.refresh(loginRes.refresh_token);
    assert.notEqual(rot1.refresh_token, loginRes.refresh_token);
    const parsedT2 = parseRefreshToken(rot1.refresh_token);
    assert.ok(parsedT2);
    assert.equal(parsedT2.sessionId, parsedT1.sessionId);

    const afterRot1Row = await getSessionRow(parsedT1.sessionId);
    assert.ok(afterRot1Row);
    assert.equal(afterRot1Row.previous_refresh_token_hash, parsedT1.secretHash);
    assert.equal(afterRot1Row.refresh_token_hash, parsedT2.secretHash);
    assert.ok(afterRot1Row.rotated_at !== null, 'rotated_at wajib terisi setelah rotasi');
    assert.equal(afterRot1Row.revoked_at, null);
    console.log('✅ 1. Rotasi normal menyimpan previous_refresh_token_hash & rotated_at');

    // =========================================================================
    // 2. Ledakan Request Paralel (8x Promise.all dengan refresh token T2 sama)
    // =========================================================================
    const tokenVersionBeforeBurst = await getTokenVersion(testUserId);
    const burstResponses = await Promise.all(
      Array.from({ length: 8 }, () => AuthService.refresh(rot1.refresh_token))
    );

    assert.equal(burstResponses.length, 8);
    const uniqueBurstRefreshTokens = new Set(burstResponses.map((r) => r.refresh_token));
    assert.equal(
      uniqueBurstRefreshTokens.size,
      1,
      'Seluruh 8 request paralel dalam grace window (warm cache) harus menerima refresh_token identik (T3)'
    );

    const tokenT3 = burstResponses[0].refresh_token;
    assert.notEqual(tokenT3, rot1.refresh_token);
    assert.equal(
      await getTokenVersion(testUserId),
      tokenVersionBeforeBurst,
      'token_version tidak boleh naik saat grace window menangani request paralel'
    );

    const afterBurstRow = await getSessionRow(parsedT1.sessionId);
    assert.ok(afterBurstRow);
    assert.equal(afterBurstRow.revoked_at, null, 'Sesi tidak boleh dicabut akibat burst paralel');

    // Pastikan T3 benar-benar valid untuk rotasi normal berikutnya (T3 -> T4)
    const rotT4 = await AuthService.refresh(tokenT3);
    assert.notEqual(rotT4.refresh_token, tokenT3);
    console.log('✅ 2. Burst 8 request paralel sukses idempoten tanpa TOKEN_REPLAY_DETECTED');

    // =========================================================================
    // 3. Retry Sekuensial (Warm Cache & Cold Cache / Simulasi Server Restart)
    // =========================================================================
    // 3a. Warm cache retry dengan T3 (token sebelumnya, masih dalam grace window)
    const warmRetry = await AuthService.refresh(tokenT3);
    assert.equal(
      warmRetry.refresh_token,
      rotT4.refresh_token,
      'Retry warm-cache dalam grace window wajib mengembalikan T4 secara idempoten'
    );

    // 3b. Cold cache retry (simulasi backend restart di tengah jendela 15 detik)
    const beforeColdRow = await getSessionRow(parsedT1.sessionId);
    assert.ok(beforeColdRow?.rotated_at);
    const originalRotatedAtIso = new Date(beforeColdRow.rotated_at).toISOString();

    AuthService.clearGraceCacheForTesting(parsedT1.sessionId);
    const coldRetry = await AuthService.refresh(tokenT3);
    assert.notEqual(coldRetry.refresh_token, tokenT3);
    assert.notEqual(coldRetry.refresh_token, rotT4.refresh_token);

    const afterColdRow = await getSessionRow(parsedT1.sessionId);
    assert.ok(afterColdRow);
    assert.equal(afterColdRow.revoked_at, null);
    assert.equal(
      new Date(afterColdRow.rotated_at!).toISOString(),
      originalRotatedAtIso,
      'Cold-cache fallback TIDAK boleh memperpanjang rotated_at awal (cegah infinite grace chaining)'
    );

    // Pastikan token hasil cold-cache fallback (T5) berfungsi untuk rotasi normal -> T6
    const rotT6 = await AuthService.refresh(coldRetry.refresh_token);
    assert.notEqual(rotT6.refresh_token, coldRetry.refresh_token);
    console.log('✅ 3. Retry sekuensial (warm cache & cold-cache restart fallback) aman tanpa revoke sesi');

    // =========================================================================
    // 4. Replay DI LUAR Grace Window WAJIB memicu TOKEN_REPLAY_DETECTED & cabut semua sesi
    // =========================================================================
    // Buat sesi kedua milik user yang sama untuk memastikan revocation menyapu seluruh sesi
    const secondDeviceLogin = await AuthService.login(testUsername, initialPassword, {
      userAgent: 'SecondDevice/1.0',
      ipAddress: '127.0.0.2',
    });
    const secondSessionId = parseRefreshToken(secondDeviceLogin.refresh_token)!.sessionId;

    const expiredOffsetSec = env.jwtRefreshGraceWindowSeconds + 10;
    await pool.query(
      `UPDATE user_sessions
       SET rotated_at = CURRENT_TIMESTAMP - ($1::int * INTERVAL '1 second')
       WHERE id = $2`,
      [expiredOffsetSec, parsedT1.sessionId]
    );
    AuthService.clearGraceCacheForTesting(parsedT1.sessionId);

    const tokenVersionBeforeReplay = await getTokenVersion(testUserId);
    await assert.rejects(
      () => AuthService.refresh(coldRetry.refresh_token),
      (err: unknown) =>
        err instanceof AppHttpError && err.statusCode === 401 && err.code === 'TOKEN_REPLAY_DETECTED',
      'Replay previous_refresh_token_hash di luar grace window wajib melempar 401 TOKEN_REPLAY_DETECTED'
    );

    assert.equal(
      await getTokenVersion(testUserId),
      tokenVersionBeforeReplay + 1,
      'token_version wajib naik +1 saat replay nyata terdeteksi'
    );
    const revokedPrimary = await getSessionRow(parsedT1.sessionId);
    const revokedSecond = await getSessionRow(secondSessionId);
    assert.ok(revokedPrimary?.revoked_at !== null, 'Sesi utama wajib dicabut');
    assert.ok(revokedSecond?.revoked_at !== null, 'Sesi perangkat lain user wajib ikut dicabut');
    console.log('✅ 4. Replay di luar grace window tetap memicu 401 TOKEN_REPLAY_DETECTED & cabut semua sesi');

    // =========================================================================
    // 5. Token Palsu / Tampered Secret DI DALAM Grace Window WAJIB langsung ditolak
    // =========================================================================
    const loginTamper = await AuthService.login(testUsername, initialPassword, {
      userAgent: 'TamperTest/1.0',
      ipAddress: '127.0.0.1',
    });
    const tamperSid = parseRefreshToken(loginTamper.refresh_token)!.sessionId;
    await AuthService.refresh(loginTamper.refresh_token); // rotated_at < 1 detik lalu

    const fakeToken = `${tamperSid}.${'ab'.repeat(32)}`;
    const tvBeforeTamper = await getTokenVersion(testUserId);
    await assert.rejects(
      () => AuthService.refresh(fakeToken),
      (err: unknown) =>
        err instanceof AppHttpError && err.statusCode === 401 && err.code === 'TOKEN_REPLAY_DETECTED',
      'Secret palsu wajib langsung memicu TOKEN_REPLAY_DETECTED walau sesi baru saja berotasi'
    );
    assert.equal(await getTokenVersion(testUserId), tvBeforeTamper + 1);
    console.log('✅ 5. Secret palsu langsung ditolak 401 TOKEN_REPLAY_DETECTED meski di dalam jendela 15 detik');

    // =========================================================================
    // 6. changePassword & logout WAJIB langsung memutus grace window token lama
    // =========================================================================
    const loginPw = await AuthService.login(testUsername, initialPassword, {
      userAgent: 'ChangePwTest/1.0',
      ipAddress: '127.0.0.1',
    });
    const pwSid = parseRefreshToken(loginPw.refresh_token)!.sessionId;
    const rotBeforePw = await AuthService.refresh(loginPw.refresh_token);

    const newPassword = 'NewPassword#456';
    await AuthService.changePassword(
      testUserId,
      pwSid,
      { current_password: initialPassword, new_password: newPassword },
      { userAgent: 'ChangePwTest/1.0', ipAddress: '127.0.0.1' }
    );

    await assert.rejects(
      () => AuthService.refresh(rotBeforePw.refresh_token),
      (err: unknown) =>
        err instanceof AppHttpError && err.statusCode === 401 && err.code === 'TOKEN_REPLAY_DETECTED',
      'Token sebelum ganti password tidak boleh lolos grace window'
    );

    const loginLogout = await AuthService.login(testUsername, newPassword, {
      userAgent: 'LogoutTest/1.0',
      ipAddress: '127.0.0.1',
    });
    const logoutSid = parseRefreshToken(loginLogout.refresh_token)!.sessionId;
    await AuthService.refresh(loginLogout.refresh_token);
    await AuthService.logout(logoutSid);

    await assert.rejects(
      () => AuthService.refresh(loginLogout.refresh_token),
      (err: unknown) =>
        err instanceof AppHttpError && err.statusCode === 401 && err.code === 'TOKEN_REPLAY_DETECTED',
      'Token dari sesi yang sudah logout tidak boleh lolos grace window'
    );
    console.log('✅ 6. changePassword & logout langsung memutus grace window secara ketat');

    // =========================================================================
    // 7. Frontend api.ts Single-Flight Refresh Mutex & Ketahanan Jaringan
    // =========================================================================
    await testFrontendSingleFlightMutex();
    console.log('✅ 7. Frontend api.ts single-flight mutex, late-401 dedup & proteksi offline lolos 100%');

    console.log('\n🎉 SEMUA 7 SKENARIO PENGUJIAN ISSUE #4 LOLOS 100%!');
  } finally {
    AuthService.clearGraceCacheForTesting();
    await pool.query(`DELETE FROM users WHERE id = $1`, [testUserId]);
    await pool.end();
  }
}

runTests().catch((err) => {
  console.error('❌ Pengujian Issue #4 gagal:', err);
  process.exit(1);
});
