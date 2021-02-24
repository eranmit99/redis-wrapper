const RedisClient = require('./redis-client');

class RedisFactory {
	constructor({redis, config}) {
		this.redis = redis;
		this.config = config;
		this.instances = {}
	}

	/**
	 * Returns the a new ladingo redis object which is initialized in a transaction (multi) mode
	 * @returns {object} ladingo-redis
	 */
	getMultiClient(config) {
		const instanceKey = `multi_${this.config.host}_${this.config.port}`;
		if (!this.instances[instanceKey]) {
			this.instances[instanceKey] = new RedisClient({
				redis: this.redis,
				config: config || this.config,
				mode: 'multi'
			})
		}
		return this.instances[instanceKey];
	}

	/**
	 * Returns the a new ladingo redis object which is initialized in a single action mode
	 * @returns {object} ladingo-redis
	 */
	getClient(config) {
		const instanceKey = `single_${this.config.host}_${this.config.port}`;
		if (!this.instances[instanceKey]) {
			this.instances[instanceKey] = new RedisClient({
				redis: this.redis,
				config: config || this.config,
				mode: 'single'
			})
		}
		return this.instances[instanceKey];
	}
}
let instance = null;

module.exports = (config) => {
	if  (!instance) {
		instance = new RedisFactory(config);
	}
	return instance;
}

