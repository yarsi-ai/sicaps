import React from 'react';
import { Document, Page, View, Text, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import type { DocumentProps } from '@react-pdf/renderer';
import { getResult } from '@/features/screening-chat-v1';
import type { ResultResponse } from '@/features/screening-chat-v1';
import type { SupportedLocale } from '@/lib/config';

// ─── Locale Labels ───

const LABELS: Record<SupportedLocale, Record<string, string>> = {
  id: {
    title: 'SICAPS - Screening Skabies',
    institution: 'Universitas Yarsi',
    riskLevel: 'Tingkat Risiko',
    totalScore: 'Skor Total',
    scoreBreakdown: 'Rincian Skor per Kategori',
    conclusion: 'Kesimpulan',
    perceptionResponse: 'Respons Persepsi',
    recommendation: 'Rekomendasi',
    personalizedSuggestion: 'Saran Personal',
    disclaimer:
      'Disclaimer: Hasil screening ini bukan diagnosis medis. Silakan konsultasikan dengan tenaga kesehatan untuk pemeriksaan lebih lanjut.',
    low: 'RENDAH',
    moderate: 'SEDANG',
    high: 'TINGGI',
    completedAt: 'Tanggal Selesai',
    notAvailable: 'Tidak tersedia',
  },
  en: {
    title: 'SICAPS - Scabies Screening',
    institution: 'Universitas Yarsi',
    riskLevel: 'Risk Level',
    totalScore: 'Total Score',
    scoreBreakdown: 'Score Breakdown by Category',
    conclusion: 'Conclusion',
    perceptionResponse: 'Perception Response',
    recommendation: 'Recommendation',
    personalizedSuggestion: 'Personalized Suggestion',
    disclaimer:
      'Disclaimer: This screening result is not a medical diagnosis. Please consult a healthcare professional for further examination.',
    low: 'LOW',
    moderate: 'MODERATE',
    high: 'HIGH',
    completedAt: 'Completed At',
    notAvailable: 'Not available',
  },
};

const CATEGORY_LABELS: Record<SupportedLocale, Record<string, string>> = {
  id: {
    intensitas: 'Intensitas Gatal',
    waktu: 'Waktu Gatal',
    lokasi_tubuh: 'Lokasi Tubuh',
    kontak: 'Kontak',
    lesi: 'Lesi Kulit',
    faktor_risiko: 'Faktor Risiko',
  },
  en: {
    intensitas: 'Itch Intensity',
    waktu: 'Itch Timing',
    lokasi_tubuh: 'Body Location',
    kontak: 'Contact',
    lesi: 'Skin Lesion',
    faktor_risiko: 'Risk Factor',
  },
};

// ─── Styles ───

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 11,
    fontFamily: 'Helvetica',
  },
  header: {
    textAlign: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 4,
  },
  institution: {
    fontSize: 12,
    color: '#555555',
    marginBottom: 12,
  },
  separator: {
    borderBottomWidth: 1,
    borderBottomColor: '#cccccc',
    marginBottom: 16,
  },
  section: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 6,
  },
  riskBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  riskLabel: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    marginRight: 8,
  },
  riskValue: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    padding: 4,
  },
  scoreRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 3,
    borderBottomWidth: 0.5,
    borderBottomColor: '#eeeeee',
  },
  scoreCategory: {
    fontSize: 10,
  },
  scoreValue: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
  },
  bodyText: {
    fontSize: 10,
    lineHeight: 1.5,
  },
  completedAt: {
    fontSize: 9,
    color: '#777777',
    marginBottom: 8,
  },
  disclaimer: {
    marginTop: 20,
    paddingTop: 10,
    borderTopWidth: 0.5,
    borderTopColor: '#cccccc',
    fontSize: 8,
    color: '#888888',
    fontStyle: 'italic',
  },
});

// ─── Document Component ───

interface ScreeningResultDocumentProps {
  result: ResultResponse;
  locale: SupportedLocale;
}

function ScreeningResultDocument({
  result,
  locale,
}: ScreeningResultDocumentProps): React.ReactElement {
  const l = LABELS[locale];
  const catLabels = CATEGORY_LABELS[locale];

  const riskLevelDisplay =
    result.riskLevel === 'LOW' ? l.low : result.riskLevel === 'MODERATE' ? l.moderate : l.high;

  return React.createElement(
    Document,
    { title: l.title, author: l.institution },
    React.createElement(
      Page,
      { size: 'A4', style: styles.page },
      // Header
      React.createElement(
        View,
        { style: styles.header },
        React.createElement(Text, { style: styles.title }, l.title),
        React.createElement(Text, { style: styles.institution }, l.institution),
      ),
      React.createElement(View, { style: styles.separator }),
      // Completed date
      React.createElement(
        Text,
        { style: styles.completedAt },
        `${l.completedAt}: ${result.completedAt}`,
      ),
      // Risk badge + score
      React.createElement(
        View,
        { style: styles.riskBadge },
        React.createElement(Text, { style: styles.riskLabel }, `${l.riskLevel}: `),
        React.createElement(Text, { style: styles.riskValue }, riskLevelDisplay),
      ),
      React.createElement(
        View,
        { style: styles.section },
        React.createElement(
          Text,
          { style: styles.bodyText },
          `${l.totalScore}: ${result.totalScore}`,
        ),
      ),
      // Score breakdown
      React.createElement(
        View,
        { style: styles.section },
        React.createElement(Text, { style: styles.sectionTitle }, l.scoreBreakdown),
        ...Object.entries(result.scores).map(([category, score]) =>
          React.createElement(
            View,
            { style: styles.scoreRow, key: category },
            React.createElement(
              Text,
              { style: styles.scoreCategory },
              catLabels[category] ?? category,
            ),
            React.createElement(Text, { style: styles.scoreValue }, String(score)),
          ),
        ),
      ),
      // Conclusion
      React.createElement(
        View,
        { style: styles.section },
        React.createElement(Text, { style: styles.sectionTitle }, l.conclusion),
        React.createElement(Text, { style: styles.bodyText }, result.conclusion || l.notAvailable),
      ),
      // Perception Response
      React.createElement(
        View,
        { style: styles.section },
        React.createElement(Text, { style: styles.sectionTitle }, l.perceptionResponse),
        React.createElement(
          Text,
          { style: styles.bodyText },
          result.perceptionResponse || l.notAvailable,
        ),
      ),
      // Recommendation
      React.createElement(
        View,
        { style: styles.section },
        React.createElement(Text, { style: styles.sectionTitle }, l.recommendation),
        React.createElement(
          Text,
          { style: styles.bodyText },
          result.recommendation || l.notAvailable,
        ),
      ),
      // Personalized Suggestion
      React.createElement(
        View,
        { style: styles.section },
        React.createElement(Text, { style: styles.sectionTitle }, l.personalizedSuggestion),
        React.createElement(
          Text,
          { style: styles.bodyText },
          result.personalizedSuggestion || l.notAvailable,
        ),
      ),
      // Disclaimer
      React.createElement(Text, { style: styles.disclaimer }, l.disclaimer),
    ),
  );
}

// ─── Public API ───

/**
 * Generates a PDF buffer for a completed screening result.
 * Uses @react-pdf/renderer for server-side PDF generation.
 *
 * @param sessionId - The completed screening session ID
 * @param locale - The locale for PDF content labels (id/en)
 * @returns Buffer containing the generated PDF binary
 */
export async function generateResultPdf(
  sessionId: string,
  locale: SupportedLocale,
): Promise<Buffer> {
  const result = await getResult(sessionId);

  const document = ScreeningResultDocument({
    result,
    locale,
  }) as React.ReactElement<DocumentProps>;
  const buffer = await renderToBuffer(document);

  return buffer;
}
