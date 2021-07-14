import { testInFiber } from '../../../__mocks__/helpers/jest'
import { setupDefaultStudioEnvironment } from '../../../__mocks__/helpers/database'
import { Studios, Studio, StudioId } from '../../../lib/collections/Studios'
import { waitTime, protectString } from '../../../lib/lib'
import { CacheForStudio } from '../../api/studio/cache'
import { Timeline, TimelineComplete } from '../../../lib/collections/Timeline'

// setLoggerLevel('info')

describe('DatabaseCaches', () => {
	beforeEach(async () => {
		await setupDefaultStudioEnvironment()
	})
	describe('CacheForStudio', () => {
		testInFiber('Insert, update & remove', async () => {
			const studio = Studios.findOne() as Studio
			expect(studio).toBeTruthy()

			const added = jest.fn()
			const changed = jest.fn()
			const removed = jest.fn()
			Timeline.find().observeChanges({
				added,
				changed,
				removed,
			})

			let dbObj: TimelineComplete | undefined
			const cache = await CacheForStudio.create(studio._id)

			const id: StudioId = protectString('tewtDoc1')

			// Insert a document:
			cache.Timeline.insert({
				_id: id,
				timeline: [],
				timelineHash: protectString('insert'),
				generated: 1234,
			})
			cache.Timeline.update(id, { $set: { timelineHash: protectString('insertthenupdate') } })

			expect(cache.Timeline.findOne(id)).toBeTruthy()
			expect(Timeline.findOne(id)).toBeFalsy()

			waitTime(1) // to allow for observers to trigger
			expect(added).toHaveBeenCalledTimes(0)
			expect(changed).toHaveBeenCalledTimes(0)
			expect(removed).toHaveBeenCalledTimes(0)

			await cache.saveAllToDatabase()
			waitTime(1) // to allow for observers to trigger
			expect(added).toHaveBeenCalledTimes(1)
			expect(changed).toHaveBeenCalledTimes(0) // the previous update should have been included in the insert
			expect(removed).toHaveBeenCalledTimes(0)
			added.mockClear()
			dbObj = Timeline.findOne(id)
			expect(dbObj).toMatchObject({ timelineHash: 'insertthenupdate' })

			// Update a document:
			cache.Timeline.update(
				{
					timelineHash: protectString('insertthenupdate'),
				},
				{ $set: { timelineHash: protectString('updated') } }
			)

			await cache.saveAllToDatabase()

			waitTime(1) // to allow for observers to trigger
			expect(added).toHaveBeenCalledTimes(0)
			expect(changed).toHaveBeenCalledTimes(1)
			expect(removed).toHaveBeenCalledTimes(0)
			changed.mockClear()
			dbObj = Timeline.findOne(id)
			expect(dbObj).toMatchObject({ timelineHash: 'updated' })

			// Remove a document:
			cache.Timeline.remove(id)

			await cache.saveAllToDatabase()
			waitTime(1) // to allow for observers to trigger
			expect(added).toHaveBeenCalledTimes(0)
			expect(changed).toHaveBeenCalledTimes(0)
			expect(removed).toHaveBeenCalledTimes(1)
			removed.mockClear()
			expect(Timeline.findOne(id)).toBeFalsy()
		})
		testInFiber('Multiple saves', async () => {
			const studio = Studios.findOne() as Studio
			expect(studio).toBeTruthy()

			const added = jest.fn()
			const changed = jest.fn()
			const removed = jest.fn()
			Timeline.find().observeChanges({
				added,
				changed,
				removed,
			})

			const cache = await CacheForStudio.create(studio._id)

			const id: StudioId = protectString('tewtDoc1')

			// Insert a document:
			cache.Timeline.insert({
				_id: id,
				timeline: [],
				timelineHash: protectString('insert'),
				generated: 1234,
			})
			const deferFcn0 = jest.fn(() => {
				expect(Timeline.findOne(id)).toBeFalsy()
			})
			const deferAfterSaveFcn0 = jest.fn(() => {
				expect(Timeline.findOne(id)).toBeTruthy()
			})
			cache.defer(deferFcn0)
			cache.deferAfterSave(deferAfterSaveFcn0)

			expect(Timeline.findOne(id)).toBeFalsy()
			await cache.saveAllToDatabase()
			waitTime(1) // to allow for observers to trigger
			expect(added).toHaveBeenCalledTimes(1)
			expect(changed).toHaveBeenCalledTimes(0)
			expect(removed).toHaveBeenCalledTimes(0)
			expect(Timeline.findOne(id)).toBeTruthy()
			expect(deferFcn0).toHaveReturnedTimes(1)
			expect(deferAfterSaveFcn0).toHaveReturnedTimes(1)
			added.mockClear()
			deferFcn0.mockClear()
			deferAfterSaveFcn0.mockClear()

			// Running the save again should render no changes:
			await cache.saveAllToDatabase()
			waitTime(1) // to allow for observers to trigger
			expect(added).toHaveBeenCalledTimes(0)
			expect(changed).toHaveBeenCalledTimes(0)
			expect(removed).toHaveBeenCalledTimes(0)
			expect(deferFcn0).toHaveReturnedTimes(0)
			expect(deferAfterSaveFcn0).toHaveReturnedTimes(0)

			// Update the document:
			cache.Timeline.update(id, { $set: { timelineHash: protectString('updated') } })
			// add new defered functions:
			const deferFcn1 = jest.fn(() => {
				expect(Timeline.findOne(id)).toMatchObject({ timelineHash: protectString('insert') })
			})
			const deferAfterSaveFcn1 = jest.fn(() => {
				expect(Timeline.findOne(id)).toMatchObject({ timelineHash: protectString('updated') })
			})
			cache.defer(deferFcn1)
			cache.deferAfterSave(deferAfterSaveFcn1)

			await cache.saveAllToDatabase()
			waitTime(1) // to allow for observers to trigger
			expect(added).toHaveBeenCalledTimes(0)
			expect(changed).toHaveBeenCalledTimes(1)
			expect(removed).toHaveBeenCalledTimes(0)
			expect(deferFcn0).toHaveReturnedTimes(0)
			expect(deferAfterSaveFcn0).toHaveReturnedTimes(0)
			expect(deferFcn1).toHaveReturnedTimes(1)
			expect(deferAfterSaveFcn1).toHaveReturnedTimes(1)
			changed.mockClear()
			deferFcn1.mockClear()
			deferAfterSaveFcn1.mockClear()

			// Remove the document:
			cache.Timeline.remove(id)

			await cache.saveAllToDatabase()
			waitTime(1) // to allow for observers to trigger
			expect(added).toHaveBeenCalledTimes(0)
			expect(changed).toHaveBeenCalledTimes(0)
			expect(removed).toHaveBeenCalledTimes(1)
			expect(deferFcn0).toHaveReturnedTimes(0)
			expect(deferAfterSaveFcn0).toHaveReturnedTimes(0)
			expect(deferFcn1).toHaveReturnedTimes(0)
			expect(deferAfterSaveFcn1).toHaveReturnedTimes(0)
		})

		testInFiber('Assert no changes', async () => {
			const studio = Studios.findOne() as Studio
			expect(studio).toBeTruthy()

			const added = jest.fn()
			const changed = jest.fn()
			const removed = jest.fn()
			Timeline.find().observeChanges({
				added,
				changed,
				removed,
			})

			{
				const cache = await CacheForStudio.create(studio._id)

				const cachedStudio = cache.Studio.doc
				expect(cachedStudio).toMatchObject(studio)

				cache.assertNoChanges() // this shouldn't throw
				expect(true).toBeTruthy()
			}

			{
				const cache = await CacheForStudio.create(studio._id)
				const id: StudioId = protectString('myPlaylist0')

				// Insert a document:
				cache.Timeline.insert({
					_id: id,
					timeline: [],
					timelineHash: protectString('insert'),
					generated: 1234,
				})
				cache.Timeline.update(id, { $set: { timelineHash: protectString('insertthenupdate') } })

				expect(cache.Timeline.findOne(id)).toBeTruthy()
				expect(Timeline.findOne(id)).toBeFalsy()

				expect(() => {
					cache.assertNoChanges()
				}).toThrowError(/failed .+ assertion,.+ was modified/gi)
			}

			{
				const cache = await CacheForStudio.create(studio._id)

				// Insert a document:
				cache.defer(() => {})

				expect(() => {
					cache.assertNoChanges()
				}).toThrowError(/failed .+ assertion,.+ deferred/gi)
			}

			{
				const cache = await CacheForStudio.create(studio._id)

				// Insert a document:
				cache.deferAfterSave(() => {})

				expect(() => {
					cache.assertNoChanges()
				}).toThrowError(/failed .+ assertion,.+ after-save deferred/gi)
			}
		})
	})
})
