/**
 * Local Cross-Encoder Reranker Service (Two-Stage Retrieval)
 *
 * Berjalan 100% lokal di CPU menggunakan @huggingface/transformers (ONNX Runtime).
 * Mengevaluasi pasangan [query, productText] secara bersamaan pada Top-K kandidat
 * dari Hybrid/Semantic Retrieval untuk membuang false-positive (hard drop) dan
 * menghasilkan urutan presisi tinggi.
 *
 * Dikontrol melalui environment variable:
 * - RERANKER_ENABLED   : 'true' untuk mengaktifkan (default: 'false')
 * - RERANKER_MODEL     : Model ONNX HuggingFace (default: 'onnx-community/gte-multilingual-reranker-base')
 * - RERANKER_DTYPE     : Kuantisasi model (default: 'q8')
 * - RERANKER_MIN_SCORE : Skor sigmoid minimum [0..1] agar kandidat semantik lolos (default: 0.25)
 * - RERANKER_TOP_K     : Jumlah maksimum kandidat yang di-rerank per kueri (default: 15)
 * - RERANKER_TIMEOUT_MS: Batas waktu reranking sebelum fallback ke skor Tahap 2 (default: 2500)
 */

import path from 'path';
import { logger } from '../utils/logger.js';

export type RerankerModelStatus = 'disabled' | 'initializing' | 'downloading' | 'ready' | 'error';

export interface RerankCandidate {
  id: string;
  text: string;
}

export interface RerankScoreItem {
  id: string;
  logit: number;
  score: number; // Sigmoid probability [0..1]
}

export interface RerankerStatusInfo {
  enabled: boolean;
  status: RerankerModelStatus;
  model_name: string;
  min_score: number;
  top_k: number;
  cache_size: number;
  error: string | null;
}

export class RerankerService {
  private static tokenizer: any = null;
  private static model: any = null;
  private static isLoading = false;
  private static status: RerankerModelStatus = 'disabled';
  private static lastError: string | null = null;
  private static loadFailedUntil = 0;
  private static readonly LOAD_RETRY_COOLDOWN_MS = 5 * 60 * 1000; // 5 menit cooldown jika gagal load

  // LRU cache hasil reranking per (query + candidateIds)
  private static cache = new Map<string, { scores: Map<string, RerankScoreItem>; timestamp: number }>();
  private static readonly MAX_CACHE = 256;
  private static readonly CACHE_TTL_MS = 30 * 60 * 1000; // 30 menit

  public static isEnabled(): boolean {
    return (process.env.RERANKER_ENABLED || 'false').toLowerCase() === 'true';
  }

  public static getModelName(): string {
    return process.env.RERANKER_MODEL || 'SugoLabs/mmarco-mMiniLMv2-L12-H384-v1';
  }

  public static getDtype(): string {
    return process.env.RERANKER_DTYPE || 'q8';
  }

  public static getMinScore(): number {
    const parsed = Number(process.env.RERANKER_MIN_SCORE);
    return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : 0.25;
  }

  public static getTopK(): number {
    const parsed = Number(process.env.RERANKER_TOP_K);
    return Number.isFinite(parsed) && parsed >= 1 ? Math.min(parsed, 30) : 10;
  }

  public static getTimeoutMs(): number {
    const parsed = Number(process.env.RERANKER_TIMEOUT_MS);
    return Number.isFinite(parsed) && parsed >= 200 ? parsed : 3500;
  }

  private static sigmoid(x: number): number {
    if (x >= 20) return 1.0;
    if (x <= -20) return 0.0;
    return 1 / (1 + Math.exp(-x));
  }

  /**
   * Memuat tokenizer dan model cross-encoder ONNX secara lazy
   */
  private static async ensureLoaded(): Promise<boolean> {
    if (!this.isEnabled()) {
      this.status = 'disabled';
      return false;
    }

    if (this.tokenizer && this.model) {
      this.status = 'ready';
      return true;
    }

    if (this.isLoading) {
      // Jangan memblokir permintaan pencarian jika model masih sedang diunduh di latar belakang
      return false;
    }

    if (Date.now() < this.loadFailedUntil) {
      return false;
    }

    this.isLoading = true;
    this.status = 'downloading';
    const modelName = this.getModelName();
    const dtype = this.getDtype();

    try {
      logger.info('AI_RERANKER', `Memuat model Cross-Encoder lokal ${modelName} (${dtype})...`);
      const { AutoTokenizer, AutoModelForSequenceClassification, env } = await import(
        '@huggingface/transformers'
      );

      const baseDir = process.cwd().endsWith('backend')
        ? process.cwd()
        : path.resolve(process.cwd(), 'backend');
      env.cacheDir = path.resolve(baseDir, '.cache', 'models');
      env.allowLocalModels = true;
      env.allowRemoteModels = true;

      this.tokenizer = await AutoTokenizer.from_pretrained(modelName);
      this.model = await AutoModelForSequenceClassification.from_pretrained(modelName, {
        dtype: dtype as any,
      });

      this.status = 'ready';
      this.lastError = null;
      logger.info('AI_RERANKER', `Model Cross-Encoder ${modelName} siap digunakan secara lokal.`);
      return true;
    } catch (err: any) {
      this.status = 'error';
      this.lastError = err?.message || 'Gagal memuat model Cross-Encoder';
      this.loadFailedUntil = Date.now() + this.LOAD_RETRY_COOLDOWN_MS;
      logger.warn('AI_RERANKER', `Gagal memuat model reranker, fallback ke skor Tahap 2: ${this.lastError}`);
      return false;
    } finally {
      this.isLoading = false;
    }
  }

  /**
   * Pemanasan model reranker di latar belakang saat server startup (non-blocking)
   */
  public static initializeInBackground(): void {
    if (!this.isEnabled()) {
      this.status = 'disabled';
      return;
    }
    this.status = 'initializing';
    setTimeout(() => {
      this.ensureLoaded().catch(() => {
        // Error sudah dicatat oleh ensureLoaded
      });
    }, 1500);
  }

  /**
   * Menghapus prefix 'passage: ' khusus E5 agar teks alami bagi Cross-Encoder
   */
  private static cleanPassageForCrossEncoder(text: string): string {
    return text.replace(/^passage:\s*/i, '').trim();
  }

  /**
   * Menilai ulang daftar kandidat terhadap kueri.
   * Mengembalikan null jika reranker nonaktif, belum siap, timeout, atau gagal (graceful fallback).
   */
  public static async rerank(
    rawQuery: string,
    candidates: RerankCandidate[],
    options?: { waitForLoad?: boolean }
  ): Promise<Map<string, RerankScoreItem> | null> {
    if (!this.isEnabled() || !rawQuery.trim() || candidates.length === 0) {
      return null;
    }

    const q = rawQuery.trim();
    const sliced = candidates.slice(0, this.getTopK());
    const cacheKey = `${q.toLowerCase()}::${sliced.map((c) => c.id).join(',')}`;
    const now = Date.now();

    const cached = this.cache.get(cacheKey);
    if (cached && now - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.scores;
    }

    // Jika belum loaded:
    // - Pada runtime HTTP normal (waitForLoad = false), picu load di background & langsung fallback agar UI tetap cepat
    // - Pada CLI benchmark (waitForLoad = true), tunggu hingga selesai load
    if (!this.tokenizer || !this.model) {
      if (options?.waitForLoad) {
        const loaded = await this.ensureLoaded();
        if (!loaded) return null;
      } else {
        this.ensureLoaded().catch(() => {});
        return null;
      }
    }

    const timeoutMs = this.getTimeoutMs();

    const runInference = async (): Promise<Map<string, RerankScoreItem>> => {
      const passages = sliced.map((c) => this.cleanPassageForCrossEncoder(c.text));
      const queries = passages.map(() => q);

      const inputs = this.tokenizer(queries, {
        text_pair: passages,
        padding: true,
        truncation: true,
        max_length: 160,
      });

      const output = await this.model(inputs);
      const logitsTensor = output.logits;
      const data: Float32Array | number[] = logitsTensor.data;
      const dims: number[] = logitsTensor.dims || [sliced.length, 1];
      const numLabels = dims.length >= 2 ? dims[1] : 1;

      const scoreMap = new Map<string, RerankScoreItem>();
      for (let i = 0; i < sliced.length; i++) {
        let logit: number;
        if (numLabels === 1) {
          logit = Number(data[i]);
        } else {
          // Binary sequence classifier [not_relevant, relevant] -> selisih logit kelas positif
          logit = Number(data[i * numLabels + (numLabels - 1)]) - Number(data[i * numLabels]);
        }
        const prob = Math.round(this.sigmoid(logit) * 10000) / 10000;
        scoreMap.set(sliced[i].id, {
          id: sliced[i].id,
          logit: Math.round(logit * 10000) / 10000,
          score: prob,
        });
      }
      return scoreMap;
    };

    try {
      const timeoutPromise = new Promise<null>((resolve) =>
        setTimeout(() => resolve(null), timeoutMs)
      );
      const result = await Promise.race([runInference(), timeoutPromise]);

      if (!result) {
        logger.warn('AI_RERANKER', `Reranking melebihi batas waktu ${timeoutMs}ms, fallback ke Tahap 2.`);
        return null;
      }

      if (this.cache.size >= this.MAX_CACHE) {
        const oldestKey = this.cache.keys().next().value;
        if (oldestKey) this.cache.delete(oldestKey);
      }
      this.cache.set(cacheKey, { scores: result, timestamp: now });
      return result;
    } catch (err: any) {
      logger.warn('AI_RERANKER', `Error inferensi reranker, fallback ke Tahap 2: ${err?.message}`);
      return null;
    }
  }

  public static clearCache(): void {
    this.cache.clear();
  }

  public static getStatus(): RerankerStatusInfo {
    const enabled = this.isEnabled();
    return {
      enabled,
      status: enabled ? this.status : 'disabled',
      model_name: this.getModelName(),
      min_score: this.getMinScore(),
      top_k: this.getTopK(),
      cache_size: this.cache.size,
      error: this.lastError,
    };
  }
}
