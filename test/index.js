'use-strict';
const redis = require('redis-mock');
const RedisFactory = require('../src/index');
const expect = require('chai').expect;

describe('redis client functionality', () => {
	const redisFactory = RedisFactory({
		redis,
		config: {
			port: '6379',
			host: 'localhost',
			options: {
				multiSetChunkSize: 1,
			},
		},
	});

	describe('Testing single mode', () => {
		let lRedis = null;

		beforeEach(async () => {
			lRedis = redisFactory.getClient();
		});

		afterEach(async () => {
			await lRedis.flushall();
		});

		it('Should set and get the value properly', async () => {
			const res = await lRedis.setValue('tester', 'tester');
			const savedData = await lRedis.getValue('tester');

			expect(res).to.eql('OK');
			expect(savedData).to.eql('tester');
		});

		it('Should set and get the JSON value properly', async () => {
			const res = await lRedis.setJsonValue('jsonTester', { key: 'value' });
			const savedData = await lRedis.getJsonValue('jsonTester');

			expect(res).to.eql('OK');
			expect(savedData).to.eql({ key: 'value' });
		});

		it('Should set and get the JSON value properly', async () => {
			const res = await lRedis.setJsonValue('jsonTester', { key: 'value' });
			const savedData = await lRedis.getJsonValue('jsonTester');

			expect(res).to.eql('OK');
			expect(savedData).to.eql({ key: 'value' });
		});

		it('Should set and get multiple values properly', async () => {
			const res = await lRedis.setValues([
				{ key: 'item1Key', value: 'item1Value' },
				{ key: 'item2Key', value: 'item2Value' },
			]);
			const savedData = await lRedis.getValues(['item1Key', 'item2Key']);

			expect(res).to.eql('OK');
			expect(savedData).to.eql(['item1Value', 'item2Value']);
		});

		it('Should get the saved keys by pattern', async () => {
			await lRedis.setValues([
				{ key: 'PREFIX/item1Key', value: 'item1Value' },
				{ key: 'PREFIX/item2Key', value: 'item2Value' },
			]);
			const savedData = await lRedis.getKeysByPattern('PREFIX/*');

			expect(savedData).to.eql(['PREFIX/item1Key', 'PREFIX/item2Key']);
		});

		it('Should delete he saved keys by pattern', async () => {
			await lRedis.setValues([
				{ key: 'PREFIX/item1Key', value: 'item1Value' },
				{ key: 'PREFIX/item2Key', value: 'item1Value' },
				{ key: 'PREFIX_A/item1Key', value: 'item2Value' },
			]);
			//deleting the saved data by pattern
			await lRedis.deleteByPattern('PREFIX/*');
			// try to get the data
			const savedData = await lRedis.getKeysByPattern('PREFIX*');

			expect(savedData).to.eql(['PREFIX_A/item1Key']);
		});

		it('Should delete the saved keys by multiple pattern', async () => {
			await lRedis.setValues([
				{ key: 'PREFIX/item1Key', value: 'item1Value' },
				{ key: 'PREFIX/item2Key', value: 'item1Value' },
				{ key: 'PREFIX_A/item1Key', value: 'item2Value' },
			]);
			//deleting the saved data by pattern
			await lRedis.deleteByPatterns(['PREFIX/*', 'PREFIX_A/*']);
			// try to get the data
			const savedData = await lRedis.getKeysByPattern('PREFIX*');

			expect(savedData).to.eql([]);
		});

		it('should check all keys exist', async () => {
			await lRedis.setValues([
				{ key: 'PREFIX/key1', value: 'OK' },
				{ key: 'PREFIX/key2', value: 'OK' },
				{ key: 'PREFIX/key3', value: 'OK' },
			]);

			expect(
				await lRedis.checkExistsAsync(
					'ALL',
					'PREFIX/key1',
					'PREFIX/key2',
					'PREFIX/key3'
				)
			).to.be.true;
		});

		it('should check all keys exist, and return false when not true', async () => {
			await lRedis.setValues([
				{ key: 'PREFIX/key1', value: 'OK' },
				{ key: 'PREFIX/key2', value: 'OK' },
				{ key: 'PREFIX/key3', value: 'OK' },
			]);

			expect(
				await lRedis.checkExistsAsync(
					'ALL',
					'PREFIX/key1',
					'PREFIX/key2',
					'PREFIX/key3',
					'nonkey'
				)
			).to.be.false;
		});

		it('should check any keys exist', async () => {
			await lRedis.setValues([
				{ key: 'PREFIX/key1', value: 'OK' },
				{ key: 'PREFIX/key2', value: 'OK' },
				{ key: 'PREFIX/key3', value: 'OK' },
			]);

			expect(
				await lRedis.checkExistsAsync(
					'ANY',
					'PREFIX/key1',
					'PREFIX/key2',
					'PREFIX/key3',
					'nonkey'
				)
			).to.be.true;
		});

		it('should check any keys exist, and return false when not true', async () => {
			await lRedis.setValues([
				{ key: 'PREFIX/key1', value: 'OK' },
				{ key: 'PREFIX/key2', value: 'OK' },
				{ key: 'PREFIX/key3', value: 'OK' },
			]);

			expect(await lRedis.checkExistsAsync('ANY', 'nonkey')).to.be.false;
		});

		it('should check key existence and return list of flags', async () => {
			await lRedis.setValues([
				{ key: 'PREFIX/key1', value: 'OK' },
				{ key: 'PREFIX/key2', value: 'OK' },
				{ key: 'PREFIX/key3', value: 'OK' },
			]);

			expect(
				await lRedis.checkExistsAsync(
					'RAW',
					'PREFIX/key1',
					'PREFIX/key2',
					'PREFIX/key3',
					'nonkey'
				)
			).to.be.deep.equal([true, true, true, false]);
		});
	});

	describe('Testing multi mode', () => {
		let lRedisMulti = null;
		let lRedisSingle = null;

		beforeEach(async () => {
			lRedisMulti = redisFactory.getMultiClient();
			lRedisSingle = redisFactory.getClient();
		});

		it('Should NOT set and get the value because the exec command was not called', async () => {
			await lRedisMulti.setValue('tester', 'tester');
			const savedData = await lRedisSingle.getValue('tester');

			expect(savedData).to.eql(null);
		});

		it('Should set and get the value properly because exec command was called', async () => {
			await lRedisMulti.setValue('tester', 'tester');
			await lRedisMulti.execMulti();

			const savedData = await lRedisSingle.getValue('tester');

			expect(savedData).to.eql('tester');
		});

		it('Should NOT set and get the JSON values properly because exec command was not called', async () => {
			const res = await lRedisMulti.setJsonValue('jsonTester', {
				key: 'value',
			});
			const savedData = await lRedisSingle.getJsonValue('jsonTester');

			expect(savedData).to.eql(null);
		});

		it('Should set and get the JSON value properly', async () => {
			await lRedisMulti.setJsonValue('jsonTester', { key: 'value' });
			await lRedisMulti.execMulti();

			const savedData = await lRedisSingle.getJsonValue('jsonTester');

			expect(savedData).to.eql({ key: 'value' });
		});

		it('Should NOT set and get multiple value properly because exec command was not called', async () => {
			const res = await lRedisMulti.setValues([
				{ key: 'item1Key', value: 'item1Value' },
				{ key: 'item2Key', value: 'item2Value' },
			]);
			const savedData = await lRedisSingle.getValues(['item1Key', 'item2Key']);

			expect(savedData).to.eql([null, null]);
		});

		it('Should set and get multiple value properly because exec command was called', async () => {
			const res = await lRedisMulti.setValues([
				{ key: 'item1Key', value: 'item1Value' },
				{ key: 'item2Key', value: 'item2Value' },
			]);
			await lRedisMulti.execMulti();
			const savedData = await lRedisSingle.getValues(['item1Key', 'item2Key']);

			expect(savedData).to.eql(['item1Value', 'item2Value']);
		});

		it('Should NOT delete he saved keys by pattern because exec command was not called', async () => {
			await lRedisSingle.setValues([
				{ key: 'PREFIX/item1Key', value: 'item1Value' },
				{ key: 'PREFIX/item2Key', value: 'item1Value' },
				{ key: 'PREFIX_A/item1Key', value: 'item2Value' },
			]);
			//deleting the saved data by pattern
			await lRedisMulti.deleteByPattern('PREFIX/*');
			// try to get the data
			const savedData = await lRedisSingle.getKeysByPattern('PREFIX*');

			expect(savedData).to.eql([
				'PREFIX/item1Key',
				'PREFIX/item2Key',
				'PREFIX_A/item1Key',
			]);
		});

		it('Should delete he saved keys by pattern because exec command was called', async () => {
			await lRedisSingle.setValues([
				{ key: 'PREFIX/item1Key', value: 'item1Value' },
				{ key: 'PREFIX/item2Key', value: 'item1Value' },
				{ key: 'PREFIX_A/item1Key', value: 'item2Value' },
			]);
			//deleting the saved data by pattern
			await lRedisMulti.deleteByPattern('PREFIX/*');
			await lRedisMulti.execMulti();
			// try to get the data
			const savedData = await lRedisSingle.getKeysByPattern('PREFIX*');

			expect(savedData).to.eql(['PREFIX_A/item1Key']);
		});
	});
});
