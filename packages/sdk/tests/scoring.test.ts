/**
 * ============================================================================
 * Tests cho Scoring Engine
 * ============================================================================
 *
 * Test cases được chia theo từng function. Đặc biệt focus:
 *  1. Tiếng Việt có dấu (use case chính của Trưởng)
 *  2. Edge cases: empty, unicode, very long
 *  3. Confidence calibration: exact match phải = 1.0
 * ============================================================================
 */

import { describe, expect, test } from "bun:test";
import { levenshtein, normalize, scoreMatch, similarity, tokenSimilarity } from "../src/scoring.ts";
import type { Match, Query } from "../src/types.ts";

// ─── Step 1: Test normalize() — nền tảng cho mọi so sánh ────────────────────
describe("normalize", () => {
  test("lowercase và trim", () => {
    expect(normalize("  Hello World  ")).toBe("hello world");
  });

  test("xoá dấu tiếng Việt", () => {
    expect(normalize("Đào Quang Trưởng")).toBe("dao quang truong");
    expect(normalize("Nguyễn Văn Á")).toBe("nguyen van a");
  });

  test('handle "đ" đặc biệt (không decompose qua NFD)', () => {
    expect(normalize("đường")).toBe("duong");
    expect(normalize("ĐÀ NẴNG")).toBe("da nang");
  });

  test("collapse multiple spaces", () => {
    expect(normalize("a    b\tc\nd")).toBe("a b c d");
  });

  test("empty string", () => {
    expect(normalize("")).toBe("");
    expect(normalize("   ")).toBe("");
  });
});

// ─── Step 2: Test Levenshtein distance ──────────────────────────────────────
describe("levenshtein", () => {
  test("identical strings → 0", () => {
    expect(levenshtein("hello", "hello")).toBe(0);
  });

  test("empty string cases", () => {
    expect(levenshtein("", "")).toBe(0);
    expect(levenshtein("abc", "")).toBe(3);
    expect(levenshtein("", "xyz")).toBe(3);
  });

  test("classic example: kitten → sitting (distance 3)", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
  });

  test("single character difference", () => {
    expect(levenshtein("cat", "bat")).toBe(1);
    expect(levenshtein("cat", "cats")).toBe(1);
  });
});

// ─── Step 3: Test similarity ratio ──────────────────────────────────────────
describe("similarity", () => {
  test("identical → 1.0", () => {
    expect(similarity("truong", "truong")).toBe(1);
  });

  test("completely different → < 0.5", () => {
    expect(similarity("abc", "xyz")).toBeLessThan(0.5);
  });

  test("case-insensitive qua normalize", () => {
    expect(similarity("Truong", "TRUONG")).toBe(1);
  });

  test("Vietnamese diacritics — quan trọng cho use case", () => {
    // "Trưởng" và "truong" phải match 100% sau normalize
    expect(similarity("Trưởng", "truong")).toBe(1);
    expect(similarity("Đào", "dao")).toBe(1);
  });

  test("typo nhẹ vẫn high similarity", () => {
    // 1 ký tự khác trên 7 → ~0.86
    expect(similarity("truong", "truong1")).toBeGreaterThan(0.8);
  });
});

// ─── Step 4: Test token similarity cho fullname ─────────────────────────────
describe("tokenSimilarity", () => {
  test("exact match", () => {
    expect(tokenSimilarity("Dao Quang Truong", "dao quang truong")).toBe(1);
  });

  test("reorder tokens vẫn match cao", () => {
    // "Truong Dao Quang" có cùng 3 tokens với "Dao Quang Truong"
    expect(tokenSimilarity("Truong Dao Quang", "Dao Quang Truong")).toBe(1);
  });

  test("partial match — 2/3 tokens", () => {
    // "Dao Quang" match 2/2 với chính nó, nhưng so với "Dao Quang Truong"
    // dùng min size = 2 → ratio = 2/2 = 1.0
    expect(tokenSimilarity("Dao Quang", "Dao Quang Truong")).toBe(1);
  });

  test("no overlap", () => {
    expect(tokenSimilarity("Alice Smith", "Bob Jones")).toBe(0);
  });

  test("Vietnamese fullname với dấu", () => {
    expect(tokenSimilarity("Đào Quang Trưởng", "dao quang truong")).toBe(1);
  });

  test("empty input", () => {
    expect(tokenSimilarity("", "something")).toBe(0);
    expect(tokenSimilarity("something", "")).toBe(0);
  });
});

// ─── Step 5: Test scoreMatch — integration của các signal ────────────────────
describe("scoreMatch", () => {
  // Helper tạo Match nhanh
  const baseMatch = (overrides: Partial<Match> = {}): Match => ({
    confidence: 0,
    evidence: [],
    ...overrides,
  });

  // Helper tạo Query nhanh
  const query = (type: Query["type"], value: string, hints?: Query["hints"]): Query => ({
    type,
    value: value.toLowerCase(),
    rawValue: value,
    ...(hints !== undefined ? { hints } : {}),
  });

  test("exact username match → confidence 1.0", () => {
    const result = scoreMatch(query("username", "truongnat"), baseMatch({ username: "truongnat" }));
    expect(result.confidence).toBe(1);
    expect(result.evidence).toContain("exact_username");
  });

  test("username typo → confidence cao nhưng < 1", () => {
    const result = scoreMatch(
      query("username", "truongnat"),
      baseMatch({ username: "truongnatt" }),
    );
    expect(result.confidence).toBeGreaterThan(0.8);
    expect(result.confidence).toBeLessThan(1);
  });

  test("username hoàn toàn khác → confidence 0", () => {
    const result = scoreMatch(query("username", "truongnat"), baseMatch({ username: "alice123" }));
    expect(result.confidence).toBe(0);
    expect(result.evidence).toHaveLength(0);
  });

  test("fullname tiếng Việt match qua tokens", () => {
    const result = scoreMatch(
      query("fullname", "Dao Quang Truong"),
      baseMatch({ displayName: "Đào Quang Trưởng" }),
    );
    expect(result.confidence).toBeGreaterThan(0.9);
    expect(result.evidence.some((e) => e.startsWith("name_tokens"))).toBe(true);
  });

  test("location hint bonus", () => {
    const withHint = scoreMatch(
      query("username", "truong", { country: "VN" }),
      baseMatch({ username: "truong", location: "Hanoi, VN" }),
    );
    const withoutHint = scoreMatch(
      query("username", "truong"),
      baseMatch({ username: "truong", location: "Hanoi, VN" }),
    );
    // Cả 2 đều exact match nên đều = 1, nhưng evidence khác
    expect(withHint.evidence).toContain("location_match");
    expect(withoutHint.evidence).not.toContain("location_match");
  });

  test("immutable — không mutate input match", () => {
    const original = baseMatch({ username: "truongnat" });
    scoreMatch(query("username", "truongnat"), original);
    expect(original.confidence).toBe(0);
    expect(original.evidence).toHaveLength(0);
  });
});
