export interface ReportQuery { tenantId:string; filters?:Record<string,unknown>; cursor?:string; pageSize?:number; }
export interface ReportResult<T>{data:T[];nextCursor?:string;freshness?:string;}
