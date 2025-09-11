import { MongoClient, Db, Collection, Document } from 'mongodb'
import { config } from '../../config/index.js'
import { logger } from '../../utils/logger.js'

let client: MongoClient | null = null
let db: Db | null = null

export async function getDb(): Promise<Db> {
  if (db) return db
  client = new MongoClient(config.mongodbUri)
  await client.connect()
  db = client.db(config.mongodbDb)
  logger.info({ db: config.mongodbDb }, 'Connected to MongoDB')
  return db
}

export async function getCollection<T extends Document = Document>(name: string): Promise<Collection<T>> {
  const database = await getDb()
  return database.collection<T>(name)
}

export async function closeDb() {
  if (client) {
    await client.close()
    client = null
    db = null
  }
}
