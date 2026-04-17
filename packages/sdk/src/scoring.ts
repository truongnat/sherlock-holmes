/**
 * ============================================================================
 * Scoring Engine
 * ============================================================================
 *
 * Tính confidence score và evidence cho mỗi match. Tách module riêng để:
 *  1. Test độc lập với fixtures (không cần mock provider)
 *  2. Provider có thể dùng helper để pre-score nếu muốn
 *  3. Dễ swap thuật toán mà không sửa provider
 *
 * Triết lý: KHÔNG provider tự assign confidence. Provider trả raw match,
 * scoring engine chấm điểm dựa trên các signal có sẵn.
 * ============================================================================
 */

import type { Match, Query } from "./types.ts";

// ─── Step 1: Normalize string để so sánh fair ────────────────────────────────
// Tiếng Việt có dấu, có thể có hoa thường khác nhau, có thể có space thừa.
// VD: "Đào Quang Trưởng" vs "dao quang truong" → phải match được.
export function normalize(input: string): string {
  return (
    input
      .normalize("NFD") // Tách ký tự gốc và dấu
      // biome-ignore lint/suspicious/noMisleadingCharacterClass: Intended for removing combining marks
      .replace(/[\u0300-\u036f]/g, "") // Xoá dấu (combining marks)
      .replace(/đ/gi, "d") // Đặc biệt: đ không nằm trong NFD decompose
      .toLowerCase()
      .replace(/\s+/g, " ") // Collapse multiple spaces
      .trim()
  );
}

// ─── Step 2: Levenshtein distance — đo độ khác nhau giữa 2 string ───────────
// Dùng cho username/fullname có typo hoặc viết tắt.
// Implementation O(m*n) đủ dùng vì input thường ngắn (<50 chars).
export function levenshtein(a: string, b: string): number {
  // Step 2.1: Edge cases — string rỗng thì distance = length của string kia
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Step 2.2: Init matrix (a.length+1) x (b.length+1)
  // matrix[i][j] = edit distance giữa a[0..i] và b[0..j]
  const matrix: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );

  // Base case: distance từ empty string đến substring = length
  for (let i = 0; i <= a.length; i++) {
    const row = matrix[i];
    if (row) row[0] = i;
  }
  const firstRow = matrix[0];
  if (firstRow) {
    for (let j = 0; j <= b.length; j++) firstRow[j] = j;
  }

  // Step 2.3: Fill matrix bằng công thức DP cổ điển
  for (let i = 1; i <= a.length; i++) {
    const row = matrix[i];
    const prevRow = matrix[i - 1];
    if (!row || !prevRow) continue;

    for (let j = 1; j <= b.length; j++) {
      // Cost = 0 nếu char giống nhau, 1 nếu khác
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(
        (prevRow[j] ?? 0) + 1, // Delete
        (row[j - 1] ?? 0) + 1, // Insert
        (prevRow[j - 1] ?? 0) + cost, // Substitute
      );
    }
  }

  return matrix[a.length]?.[b.length] ?? 0;
}

// ─── Step 3: Similarity ratio 0-1 dựa trên Levenshtein ───────────────────────
// Convert distance thành ratio để dễ combine với các signal khác.
export function similarity(a: string, b: string): number {
  const normA = normalize(a);
  const normB = normalize(b);

  // Edge case: cả 2 đều empty → coi như giống hoàn toàn
  if (normA === "" && normB === "") return 1;

  const maxLen = Math.max(normA.length, normB.length);
  if (maxLen === 0) return 1;

  const distance = levenshtein(normA, normB);
  return 1 - distance / maxLen;
}

// ─── Step 4: Token-based matching cho fullname ──────────────────────────────
// "Dao Quang Truong" vs "Truong Dao" → tách token rồi match từng cái.
// Trả về tỉ lệ token match được.
export function tokenSimilarity(a: string, b: string): number {
  const tokensA = new Set(normalize(a).split(" ").filter(Boolean));
  const tokensB = new Set(normalize(b).split(" ").filter(Boolean));

  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  // Step 4.1: Đếm token chung (intersection)
  let common = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) common++;
  }

  // Step 4.2: Jaccard-like ratio nhưng dùng min size để fair với name dài/ngắn
  return common / Math.min(tokensA.size, tokensB.size);
}

// ─── Step 5: Score 1 match dựa trên query và data có sẵn ────────────────────
// Engine gọi function này SAU KHI provider trả raw match.
// Mutate confidence và evidence của match (return new object, không sửa input).
export function scoreMatch(query: Query, match: Match): Match {
  // Step 5.1: Tích luỹ evidence và signal scores
  const evidence: string[] = [];
  const signals: number[] = [];

  // Step 5.2: Match theo query type
  if (query.type === "username" && match.username) {
    const sim = similarity(query.value, match.username);
    if (sim === 1) {
      evidence.push("exact_username");
      signals.push(1.0);
    } else if (sim >= 0.8) {
      evidence.push(`username_similarity:${sim.toFixed(2)}`);
      signals.push(sim);
    } else if (sim >= 0.5) {
      evidence.push(`username_partial:${sim.toFixed(2)}`);
      signals.push(sim * 0.7); // Penalty cho match yếu
    }
  }

  if (query.type === "email") {
    // If provider already confirmed email match (like Gravatar)
    if (match.evidence.includes("email_exact_match")) {
      evidence.push("exact_email");
      signals.push(1.0);
    }
    // If not, check if username part of email matches match.username
    const emailPrefix = query.value.split("@")[0];
    if (emailPrefix && match.username) {
      const sim = similarity(emailPrefix, match.username);
      if (sim === 1) {
        evidence.push("email_prefix_match");
        signals.push(0.9);
      }
    }
  }

  if (query.type === "fullname" && match.displayName) {
    const tokenSim = tokenSimilarity(query.value, match.displayName);
    if (tokenSim > 0) {
      evidence.push(`name_tokens:${tokenSim.toFixed(2)}`);
      signals.push(tokenSim);
    }
  }

  // Step 5.3: Bonus signal — nếu displayName chứa query value (cho mọi type)
  if (match.displayName) {
    const sim = similarity(query.value, match.displayName);
    if (sim >= 0.7 && !evidence.some((e) => e.startsWith("name_"))) {
      evidence.push(`displayname_similarity:${sim.toFixed(2)}`);
      signals.push(sim * 0.8);
    }
  }

  // Step 5.4: Bonus — location hint match
  if (query.hints?.country && match.location) {
    const locNorm = normalize(match.location);
    if (locNorm.includes(query.hints.country.toLowerCase())) {
      evidence.push("location_match");
      signals.push(0.3); // Weak signal nhưng có ích
    }
  }

  // Step 5.5: Combine signals — weighted average với cap 1.0
  // Nếu không có signal nào → confidence 0 (sẽ bị filter)
  const confidence =
    signals.length === 0 ? 0 : Math.min(1, signals.reduce((sum, s) => sum + s, 0) / signals.length);

  // Step 5.6: Return immutable new match (không mutate input)
  return {
    ...match,
    confidence,
    evidence: [...match.evidence, ...evidence],
  };
}
