import { AppConfig, ConfigManager, Dependencies } from '../config/config.js';
import { dictionaryRouters } from '../routers/dictionaryRouter.js';

export class LyricManager extends ConfigManager {
	public static async create(configData: AppConfig) {
		const manager = new LyricManager(configData);
		await manager.loadDb();
		return manager;
	}
	getRouters() {
		return {
			getDicionaryRouters: () => {
				const routers = dictionaryRouters({
					db: this.dependencies.db,
					config: this.dependencies.config,
				} as Dependencies);
				return routers;
			},
			getOtherRouter: () => {
				return null;
			},
		};
	}
	getServices() {}
}
