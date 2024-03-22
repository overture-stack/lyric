import { pgGenerate } from 'drizzle-dbml-generator';
import * as schema from '../src/models/index.js';

const out = './docs/schema.dbml';
const relational = true;

pgGenerate({ schema, out, relational });
console.log(`Generate DBML diagramen Completed!`);
