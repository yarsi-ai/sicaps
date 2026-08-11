/**
 * API request/response types consumed by the public UI.
 * These types match the server API contracts for screening endpoints.
 */

import type { EducationLevel, RiskLevel } from './screening';

export type StartRequest = {
  locale: 'id' | 'en';
  demographics: {
    name?: string;
    age: number;
    gender: 'male' | 'female';
    educationLevel: EducationLevel;
  };
};

export type StartResponse = {
  success: true;
  data: {
    sessionId: string;
    shareToken: string;
    theme: 'playful' | 'hybrid';
    locale: 'id' | 'en';
    mode: 'ai' | 'questionnaire';
    openingMessage: string;
    pills?: Array<{ id: string; label: string }>;
    pillSelection?: 'single' | 'multi';
  };
};

export type ChatRequest = {
  sessionId: string;
  message: string;
  isVoice?: boolean;
};

export type ResultResponse = {
  success: true;
  data: {
    sessionId: string;
    completedAt: string;
    demographics: {
      name: string | null;
      age: number;
      gender: string;
      educationLevel: string;
    };
    totalScore: number;
    riskLevel: RiskLevel;
    scores: Record<string, number>;
    conclusion: string;
    perceptionResponse: string | null;
    recommendation: string;
    personalizedSuggestion: string | null;
  };
};

export type TranscriptResponse = {
  success: true;
  data: {
    messages: Array<{
      role: 'bot' | 'user';
      content: string;
      createdAt: string;
      isVoice: boolean;
    }>;
  };
};
