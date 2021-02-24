const {promisify} = require('util');


class RedisClient {
    constructor({config = {}, redis, mode}) {
        this.config = config;
        this.redis = redis;
        this._isMultiMode = mode === 'multi';
        const {options = {logLevel: 'ERROR'}} = config;
        this.multiSetBatchSize = options.multiSetChunkSize || 5000;

        this.logger = console;

        this.client = this.redis.createClient(config.port, config.host, config.options);
        this.client.on('error', err => {
            this.logger.error(
                `There was an error executing the redis command:  ${err}`
            );
        });

        if (this._isMultiMode) {
            this.logger.log('Setting up the redis client in a multi mode');
            this.execObject = this._getExecObject(config, mode);
        } else {
            this.logger.log('Setting up the redis client in a single exec mode');
        }
    }

    /**
     *
     * Create a new node redis instance
     * @typedef {object} config
     * @returns {object} redisClient
     */
    _getExecObject(config, mode) {
        if (mode === 'multi') {
            return this.client.multi();
        }
        return this.client;
    }

    /**
     *
     * Executes the node redis action in async manner
     * @typedef {string} action name
     * @typedef {array} action params
     * @returns action response
     */
    async _executeAsync(method, ...params) {
        if (this._isMultiMode) {
            return Promise.resolve(this.execObject[method](...params));
        }
        const execObject = this._getExecObject(this.config);
        const res = await promisify(execObject[method]).call(execObject, ...params);

        return res;
    }

    /**
     *
     * Executes the redis command in batch
     * All redis actions are limited to 10000 rows, in order to resolve this, we need to execute in batches
     * @typedef {array} dataArray data needed to execute the action
     * @typedef {function} action function to be executed
     * @returns {Promise} execution result
     */
    async _batchExecute(dataArray, cb) {
        const batchSize = this.multiSetBatchSize;
        let currentIndex = 0;

        while (currentIndex < dataArray.length) {
            const chunk = dataArray.slice(currentIndex, (currentIndex += batchSize));
            try {
                await cb(chunk);
            } catch (e) {
                return Promise.reject(e);
            }
        }
        return Promise.resolve('OK');
    }

    /**
     * validates the deletion pattern
     * @typedef {array<string> | string} pattern object
     * @returns {boolean} validation result
     */
    _isDeletePatternValid(itemsToValidate) {
        const isValidPredicate = pattern => pattern !== '*';

        if (typeof itemsToValidate === 'string') {
            return isValidPredicate(itemsToValidate);
        }

        if (Array.isArray(itemsToValidate)) {
            return itemsToValidate.every(isValidPredicate);
        }
        return false;
    }

    /**
     * Insert multiple objects at once
     * @typedef {array<{key: string, value: string}>} objects array
     * @returns {Promise} execution result
     */
    async _internalMultiSetValue(keyValueArray) {
        const itemsToInsert = [];
        keyValueArray.forEach(item => {
            itemsToInsert.push(item.key, item.value);
        });
        try {
            return this._executeAsync('mset', itemsToInsert);
        } catch (err) {
            this.logger.error(
                `Failed to multi set data in redis  ${JSON.stringify(err)}`
            );
            throw Error(err);
        }
    }

    /**
     * Insert a single object
     * @typedef {string} object key
     * @typedef {string} object value
     * @returns {Promise} execution result
     */
    async setValue(key, value) {
        try {
            return await this._executeAsync('set', key, value);
        } catch (err) {
            this.logger.error(`Failed to set data in redis  ${JSON.stringify(err)}`);
            throw Error(err);
        }
    }

    /**
     * Insert a single JSON object
     * @typedef {string} object key
     * @typedef {object} object value
     * @returns {string} result
     */
    async setJsonValue(key, value) {
        try {
            await this._executeAsync('set', key, JSON.stringify(value));
            return 'OK';
        } catch (err) {
            this.logger.error(
                `Failed to insert json data to redis:  ${JSON.stringify(err)}`
            );
            throw Error(err);
        }
    }

    /**
     * Get a single JSON object
     * @typedef {string} object key
     * @returns {object} JSON result
     */
    async getJsonValue(key) {
        try {
            const jsonString = await this._executeAsync('get', key);
            return JSON.parse(jsonString);
        } catch (err) {
            this.logger.warn(
                `failed get json data from redis:  ${JSON.stringify(err)}`
            );
            return {};
        }
    }

    /**
     * Get a single value
     * @typedef {string} object key
     * @returns {string} result
     */
    async getValue(key) {
        try {
            return await this._executeAsync('get', key);
        } catch (err) {
            this.logger.error(
                `failed to get the data from redis :  ${JSON.stringify(err)}`
            );
            throw Error(err);
        }
    }

    /**
     * Get a multiple values
     * @typedef {array<string>} array of keys
     * @returns {array<string>} array of results
     */
    async getValues(keys) {
        try {
            return this._executeAsync('mget', keys);
        } catch (err) {
            this.logger.error(
                `failed to mget the data from redis :  ${JSON.stringify(err)}`
            );
            throw Error(err);
        }
    }

    /**
     * Set a multiple values
     * @typedef {array<{key: string, value: string}>} array of key values
     * @returns {Promise} exec result
     */
    async setValues(keyValueArray) {
        try {
            return this._batchExecute(keyValueArray, (...data) =>
                this._internalMultiSetValue(...data)
            );
        } catch (err) {
            this.logger.error(`Failed to multi save values ${JSON.stringify(err)}`);
            throw Error(err);
        }
    }

    /**
     * Get keys by pattern
     * @typedef {string} key pattern
     * @returns {Promise<array<string>>} array of key results
     */
    async getKeysByPattern(pattern) {
        try {
            return this._executeAsync('keys', pattern);
        } catch (err) {
            this.logger.error(`Failed to key by pattern ${JSON.stringify(err)}`);
            throw Error(err);
        }
    }

    /**
     * Delete by a single pattern
     * @typedef {string} key pattern
     * @returns {Promise<string>} execution result
     */
    async deleteByPattern(keyPattern) {
        if (!this._isDeletePatternValid(keyPattern)) {
            throw Error(`Invalid delete pattern ${keyPattern}`);
        }
        try {
            const tempClient = this._getExecObject(this.config);
            const dataToDelete = await promisify(tempClient.keys).call(
                tempClient,
                keyPattern
            );
            return this._batchExecute(dataToDelete, (...data) =>
                this._executeAsync('del', ...data)
            );
        } catch (err) {
            this.logger.error(`Failed to delete ${JSON.stringify(err)}`);
            throw Error(err);
        }
    }

    /**
     * Delete by multiple patterns
     * @typedef {array<string>} key patterns
     * @returns {Promise<string>} execution result
     */
    async deleteByPatterns(keyPatterns) {
        if (!Array.isArray(keyPatterns) || !this._isDeletePatternValid(keyPatterns)) {
            throw Error(`Invalid delete patterns`);
        }
        try {
            const dataToDelete = [];
            const tempClient = this._getExecObject(this.config);

            for (let i = 0; i < keyPatterns.length; i++) {
                const keyPattern = keyPatterns[i];
                const patternsToDelete = await promisify(tempClient.keys).call(
                    tempClient,
                    keyPattern
                );
                if (patternsToDelete !== '*') {
                    dataToDelete.push(...patternsToDelete);
                }
            }
            return this._batchExecute(dataToDelete, (...data) =>
                this._executeAsync('del', ...data)
            );
        } catch (err) {
            this.logger.error(`Failed to delete  ${JSON.stringify(err)}`);
            throw Error(err);
        }
    }

    /**
     * Delete all database
     * @returns {Promise<string>} execution result
     */
    async flushall() {
        try {
            return await this._executeAsync('flushall');
        } catch (err) {
            this.logger.error(
                `failed to flush all the data from redis :  ${JSON.stringify(err)}`
            );
            throw Error(err);
        }
    }

    /**
     * Executes the current transaction (multi) object
     * @returns {Promise<string>} execution result
     */
    async execMulti() {
        if (!this.execObject) {
            throw Error('The instance was not initialized in multi mode');
        }
        try {
            const res = await promisify(this.execObject.exec).call(this.execObject);
            return res;
        } catch (err) {
            this.logger.error(
                `Failed to execute multi object  ${JSON.stringify(err)}`
            );
            throw Error(err);
        }
    }
}

module.exports = RedisClient;
