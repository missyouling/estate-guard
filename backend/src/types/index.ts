import '@fastify/jwt';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      sub: number;
      role: 'admin' | 'owner';
      iat?: number;
      exp?: number;
    };
  }
}



export interface PaginationQuery {
  page?: number;
  limit?: number;
  sort?: string;
  keyword?: string;
}

export interface MediaQuery extends PaginationQuery {
  type?: string;
  category_id?: number;
  user_id?: number;
  status?: string;
  date_from?: string;
  date_to?: string;
}

export interface WallQuery extends PaginationQuery {
  view: 'grid' | 'list' | 'timeline';
  category_id?: number;
  date_from?: string;
  date_to?: string;
}
