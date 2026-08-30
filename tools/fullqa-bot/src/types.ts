export type QAStatus = 'PASS' | 'FAIL' | 'BLOCKED' | 'NOT_FOUND' | 'NOT_EXECUTED';

export interface QAResult {
  id: string;
  module: string;
  status: QAStatus;
  expected?: string;
  actual?: string;
  url?: string;
  screenshot?: string;
  error?: string;
  timestamp: string;
}

export interface DiscoveredPage {
  url: string;
  title: string;
  forms: number;
  buttons: string[];
  links: string[];
}
