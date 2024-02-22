import { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { NewCategory, dictionaryCategories } from '../models/dictionary_categories';
import { Repository } from './index';

export default class CategoryRepository extends Repository {}
