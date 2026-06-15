export interface IOptions {
  page?: number;
  limit?: number;
  sortOrder?: string;
  sortBy?: string;
}

export interface IOptionsResult {
  page: number;
  limit: number;
  skip: number;
  sortBy: string;
  sortOrder: string;
}
