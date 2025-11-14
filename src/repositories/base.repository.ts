export interface BaseRepository<T, ID, CreateInput = Partial<T>, UpdateInput = Partial<T>> {
  findById(id: ID): Promise<T | null>;
  findAll(): Promise<T[]>;
  create(data: CreateInput): Promise<T>;
  update(id: ID, data: UpdateInput): Promise<T>;
  delete(id: ID): Promise<T>;
}