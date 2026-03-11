export interface SearchResult {
  title: string;
  link: string;
  snippet: string;
  source: string;
}

export interface SearchOptions {
  limit?: number;
  deepSearch?: boolean; // Flag if we want to fetch entire page content later
}

export interface ISearchProvider {
  name: string;
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;
}
