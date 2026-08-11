export type { ApiResponse } from '@/lib/api/response';

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}
