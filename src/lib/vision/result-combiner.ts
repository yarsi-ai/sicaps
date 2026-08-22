/**
 * Result combiner for visual detection feature.
 * Pure function implementing the fixed integration table from requirements.
 *
 * This is a lib module — MUST NOT import Prisma or Next.js modules.
 * Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 13.1
 */

export type ChatbotRiskLevel = 'HIGH' | 'MODERATE' | 'LOW';
export type VisualResult = 'POSITIVE' | 'NEGATIVE';
export type FinalOutput = 'SUSPECTED_SCABIES' | 'NOT_SCABIES';

/**
 * Combine chat-based risk level with visual detection result into the final
 * screening output, per the fixed integration table:
 *
 * | Chatbot Risk | AI Visual        | Output           |
 * |--------------|------------------|-------------------|
 * | HIGH         | POSITIVE/NEGATIVE| SUSPECTED_SCABIES |
 * | MODERATE     | POSITIVE         | SUSPECTED_SCABIES |
 * | MODERATE     | NEGATIVE         | NOT_SCABIES       |
 * | LOW          | POSITIVE         | NOT_SCABIES       |
 * | LOW          | NEGATIVE         | NOT_SCABIES       |
 *
 * Pure function — no I/O, no Prisma dependency.
 */
export function combineFinalOutput(risk: ChatbotRiskLevel, visual: VisualResult): FinalOutput {
  if (risk === 'HIGH') return 'SUSPECTED_SCABIES';
  if (risk === 'MODERATE' && visual === 'POSITIVE') return 'SUSPECTED_SCABIES';
  return 'NOT_SCABIES';
}
