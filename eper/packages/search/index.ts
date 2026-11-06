export interface SearchQuery { tenantId:string; query:string; pageSize?:number; cursor?:string; }
export interface SearchResult<T>{data:T[];nextCursor?:string;freshness?:string;}
