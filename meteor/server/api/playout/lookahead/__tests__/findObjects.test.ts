import '../../../../../__mocks__/_extendJest'
import { RundownId } from '../../../../../lib/collections/Rundowns'
import { literal, omit, protectString } from '../../../../../lib/lib'
import { findLookaheadObjectsForPart } from '../findObjects'
import { Part } from '../../../../../lib/collections/Parts'
import { OnGenerateTimelineObj, PieceLifespan, TSR } from '@sofie-automation/blueprints-integration'
import { PartInstanceId } from '../../../../../lib/collections/PartInstances'
import { PieceInstance } from '../../../../../lib/collections/PieceInstances'
import { TimelineObjRundown } from '../../../../../lib/collections/Timeline'
import _ from 'underscore'
import { sortPieceInstancesByStart } from '../../pieces'

function stripObjectProperties(objs: Array<TimelineObjRundown & OnGenerateTimelineObj>, keepContent?: boolean): any[] {
	const keys = _.compact([keepContent ? undefined : 'content', 'enable', 'objectType', 'keyframes'])
	return objs.map((o) => omit(o, ...keys))
}

describe('findLookaheadObjectsForPart', () => {
	function definePart(rundownId: RundownId): Part {
		return { rundownId } as any
	}
	test('no pieces', () => {
		const currentPartInstanceId: PartInstanceId | null = null
		const rundownId: RundownId = protectString('rundown0')
		const layerName = 'layer0'
		const partInfo = { part: definePart(rundownId), pieces: [] }
		const objects = findLookaheadObjectsForPart(currentPartInstanceId, layerName, undefined, partInfo, null)
		expect(objects).toHaveLength(0)
	})

	const defaultPieceInstanceProps: Omit<PieceInstance, 'rundownId'> = {
		_id: protectString('piece0_instance'),
		partInstanceId: protectString('partInstance0'),
		playlistActivationId: protectString('active'),
		piece: {
			_id: protectString('piece0'),
			startPartId: protectString('part0'),
			externalId: '',
			name: '',
			enable: { start: 0 },
			invalid: false,
			status: 0,
			lifespan: PieceLifespan.WithinPart,
			sourceLayerId: '',
			outputLayerId: '',
			content: {
				timelineObjects: [],
			},
		},
	}

	test('layer check', () => {
		const currentPartInstanceId: PartInstanceId | null = null
		const rundownId: RundownId = protectString('rundown0')
		const layer0 = 'layer0'
		const layer1 = 'layer1'

		const partInfo = {
			part: definePart(rundownId),
			pieces: literal<PieceInstance[]>([
				{
					...defaultPieceInstanceProps,
					rundownId: rundownId,
					piece: {
						...defaultPieceInstanceProps.piece,
						content: {
							timelineObjects: [
								{
									id: 'obj0',
									enable: { start: 0 },
									layer: layer1,
									content: { deviceType: TSR.DeviceType.ABSTRACT },
								},
							],
						},
					},
				},
			]),
		}

		// Empty layer
		const objects = findLookaheadObjectsForPart(currentPartInstanceId, layer0, undefined, partInfo, null)
		expect(objects).toHaveLength(0)

		// Layer has an object
		const objects2 = findLookaheadObjectsForPart(currentPartInstanceId, layer1, undefined, partInfo, null)
		expect(objects2).toHaveLength(1)
	})

	test('single object ids', () => {
		const currentPartInstanceId: PartInstanceId | null = null
		const rundownId: RundownId = protectString('rundown0')
		const layer0 = 'layer0'
		const partInstanceId = protectString('partInstance0')

		const partInfo = {
			part: definePart(rundownId),
			pieces: literal<PieceInstance[]>([
				{
					...defaultPieceInstanceProps,
					rundownId: rundownId,
					piece: {
						...defaultPieceInstanceProps.piece,
						content: {
							timelineObjects: [
								{
									id: 'obj0',
									enable: { start: 0 },
									layer: layer0,
									content: { deviceType: TSR.DeviceType.ABSTRACT },
								},
							],
						},
					},
				},
			]),
		}

		// Run for future part
		const objects = findLookaheadObjectsForPart(currentPartInstanceId, layer0, undefined, partInfo, null)
		expect(stripObjectProperties(objects)).toStrictEqual([
			{
				id: 'obj0',
				layer: 'layer0',
				pieceInstanceId: 'piece0_instance',
				infinitePieceInstanceId: undefined,
				partInstanceId: undefined,
			},
		])

		// Run for future part with a partInstanceId
		const objects1 = findLookaheadObjectsForPart(currentPartInstanceId, layer0, undefined, partInfo, partInstanceId)
		expect(stripObjectProperties(objects1)).toStrictEqual([
			{
				id: 'obj0',
				layer: 'layer0',
				pieceInstanceId: 'piece0_instance',
				infinitePieceInstanceId: undefined,
				partInstanceId: partInstanceId,
			},
		])

		// Run for partInstance without the id
		const objects2 = findLookaheadObjectsForPart(currentPartInstanceId, layer0, undefined, partInfo, null)
		expect(stripObjectProperties(objects2)).toStrictEqual([
			{
				id: 'obj0',
				layer: 'layer0',
				pieceInstanceId: 'piece0_instance',
				infinitePieceInstanceId: undefined,
				partInstanceId: undefined,
			},
		])

		// Run for partInstance with the id
		const objects3 = findLookaheadObjectsForPart(currentPartInstanceId, layer0, undefined, partInfo, partInstanceId)
		expect(objects3).toStrictEqual(objects1)
	})

	test('single object keyframes', () => {
		const rundownId: RundownId = protectString('rundown0')
		const layer0 = 'layer0'
		const partInstanceId = protectString('partInstance0')
		const currentPartInstanceId: PartInstanceId | null = partInstanceId

		const partInfo = {
			part: definePart(rundownId),
			pieces: literal<PieceInstance[]>([
				{
					...defaultPieceInstanceProps,
					rundownId: rundownId,
					piece: {
						...defaultPieceInstanceProps.piece,
						content: {
							timelineObjects: [
								{
									id: 'obj0',
									enable: { start: 0 },
									layer: layer0,
									content: { deviceType: TSR.DeviceType.ABSTRACT },
									keyframes: [
										{
											id: 'kf0',
											enable: { start: 0 },
											content: { kf0: true } as any,
										},
										{
											id: 'kf1',
											enable: { while: 1 },
											content: { kf1: true } as any,
										},
										{
											id: 'kf2',
											enable: { while: '.is_transition' },
											content: { kf2: true } as any,
										},
									],
								},
							],
						},
					},
				},
			]),
		}

		// No transition piece
		const objects = findLookaheadObjectsForPart(currentPartInstanceId, layer0, undefined, partInfo, partInstanceId)
		expect(stripObjectProperties(objects, true)).toStrictEqual([
			{
				id: 'obj0',
				layer: 'layer0',
				pieceInstanceId: 'piece0_instance',
				infinitePieceInstanceId: undefined,
				partInstanceId: partInstanceId,
				content: {
					deviceType: 0,
				},
			},
		])

		// Allowed transition
		const previousPart: Part = { disableOutTransition: false, classesForNext: undefined } as any
		const objects1 = findLookaheadObjectsForPart(
			currentPartInstanceId,
			layer0,
			previousPart,
			partInfo,
			partInstanceId
		)
		expect(stripObjectProperties(objects1, true)).toStrictEqual(stripObjectProperties(objects, true))

		// Allowed transition with a transition
		partInfo.pieces.push({
			...defaultPieceInstanceProps,
			_id: protectString('piece1'),
			rundownId: rundownId,
			piece: {
				...defaultPieceInstanceProps.piece,
				isTransition: true,
			},
		})
		const objects2 = findLookaheadObjectsForPart(
			currentPartInstanceId,
			layer0,
			previousPart,
			partInfo,
			partInstanceId
		)
		expect(stripObjectProperties(objects2, true)).toStrictEqual([
			{
				id: 'obj0',
				layer: 'layer0',
				pieceInstanceId: 'piece0_instance',
				infinitePieceInstanceId: undefined,
				partInstanceId: partInstanceId,
				content: {
					deviceType: 0,
					kf2: true,
				},
			},
		])

		// No previous should still allow it
		const objects3 = findLookaheadObjectsForPart(currentPartInstanceId, layer0, undefined, partInfo, partInstanceId)
		expect(stripObjectProperties(objects3, true)).toStrictEqual(stripObjectProperties(objects1, true))

		// Previous disables transition
		const blockedPreviousPart: Part = { disableOutTransition: true, classesForNext: undefined } as any
		const objects4 = findLookaheadObjectsForPart(
			currentPartInstanceId,
			layer0,
			blockedPreviousPart,
			partInfo,
			partInstanceId
		)
		expect(stripObjectProperties(objects4, true)).toStrictEqual(stripObjectProperties(objects1, true))
	})

	test('multiple object ids', () => {
		const currentPartInstanceId: PartInstanceId | null = null
		const rundownId: RundownId = protectString('rundown0')
		const layer0 = 'layer0'
		const partInstanceId = protectString('partInstance0')

		const partInfo = {
			part: definePart(rundownId),
			pieces: literal<PieceInstance[]>([
				{
					...defaultPieceInstanceProps,
					rundownId: rundownId,
					piece: {
						...defaultPieceInstanceProps.piece,
						content: {
							timelineObjects: [
								{
									id: 'obj0',
									enable: { start: 0 },
									layer: layer0,
									content: { deviceType: TSR.DeviceType.ABSTRACT },
								},
							],
						},
					},
				},
				{
					...defaultPieceInstanceProps,
					_id: protectString('piece1_instance'),
					rundownId: rundownId,
					piece: {
						...defaultPieceInstanceProps.piece,
						_id: protectString('piece1'),
						enable: { start: 1000 },
						content: {
							timelineObjects: [
								{
									id: 'obj1',
									enable: { start: 0 },
									layer: layer0,
									content: { deviceType: TSR.DeviceType.ABSTRACT },
								},
							],
						},
					},
				},
			]),
		}

		// Run for future part
		const objects = findLookaheadObjectsForPart(currentPartInstanceId, layer0, undefined, partInfo, null)
		expect(stripObjectProperties(objects)).toStrictEqual([
			{
				id: 'obj0',
				layer: 'layer0',
				pieceInstanceId: 'piece0_instance',
				infinitePieceInstanceId: undefined,
				partInstanceId: undefined,
			},
			{
				id: 'obj1',
				layer: 'layer0',
				pieceInstanceId: 'piece1_instance',
				infinitePieceInstanceId: undefined,
				partInstanceId: undefined,
			},
		])

		// Run for future part with a partInstanceId
		const objects1 = findLookaheadObjectsForPart(currentPartInstanceId, layer0, undefined, partInfo, partInstanceId)
		expect(stripObjectProperties(objects1)).toStrictEqual([
			{
				id: 'obj0',
				layer: 'layer0',
				pieceInstanceId: 'piece0_instance',
				infinitePieceInstanceId: undefined,
				partInstanceId: partInstanceId,
			},
			{
				id: 'obj1',
				layer: 'layer0',
				pieceInstanceId: 'piece1_instance',
				infinitePieceInstanceId: undefined,
				partInstanceId: partInstanceId,
			},
		])

		// Run for partInstance without the id
		const objects2 = findLookaheadObjectsForPart(currentPartInstanceId, layer0, undefined, partInfo, null)
		expect(stripObjectProperties(objects2)).toStrictEqual([
			{
				id: 'obj0',
				layer: 'layer0',
				pieceInstanceId: 'piece0_instance',
				infinitePieceInstanceId: undefined,
				partInstanceId: undefined,
			},
			{
				id: 'obj1',
				layer: 'layer0',
				pieceInstanceId: 'piece1_instance',
				infinitePieceInstanceId: undefined,
				partInstanceId: undefined,
			},
		])

		// Run for partInstance with the id
		const objects3 = findLookaheadObjectsForPart(currentPartInstanceId, layer0, undefined, partInfo, partInstanceId)
		expect(stripObjectProperties(objects3)).toStrictEqual([
			{
				id: 'obj0',
				layer: 'layer0',
				pieceInstanceId: 'piece0_instance',
				infinitePieceInstanceId: undefined,
				partInstanceId: partInstanceId,
			},
			{
				id: 'obj1',
				layer: 'layer0',
				pieceInstanceId: 'piece1_instance',
				infinitePieceInstanceId: undefined,
				partInstanceId: partInstanceId,
			},
		])
	})

	test('multiple object keyframes', () => {
		const rundownId: RundownId = protectString('rundown0')
		const layer0 = 'layer0'
		const partInstanceId = protectString('partInstance0')
		const currentPartInstanceId: PartInstanceId | null = partInstanceId

		const partInfo = {
			part: definePart(rundownId),
			pieces: literal<PieceInstance[]>([
				{
					...defaultPieceInstanceProps,
					rundownId: rundownId,
					piece: {
						...defaultPieceInstanceProps.piece,
						content: {
							timelineObjects: [
								{
									id: 'obj0',
									enable: { start: 0 },
									layer: layer0,
									content: { deviceType: TSR.DeviceType.ABSTRACT },
									keyframes: [
										{
											id: 'kf0',
											enable: { start: 0 },
											content: { kf0: true } as any,
										},
										{
											id: 'kf1',
											enable: { while: 1 },
											content: { kf1: true } as any,
										},
										{
											id: 'kf2',
											enable: { while: '.is_transition' },
											content: { kf2: true } as any,
										},
									],
								},
							],
						},
					},
				},
				{
					...defaultPieceInstanceProps,
					_id: protectString('piece1_instance'),
					rundownId: rundownId,
					piece: {
						...defaultPieceInstanceProps.piece,
						_id: protectString('piece1'),
						enable: { start: 1000 },
						content: {
							timelineObjects: [
								{
									id: 'obj1',
									enable: { start: 0 },
									layer: layer0,
									content: { deviceType: TSR.DeviceType.ABSTRACT },
									keyframes: [
										{
											id: 'kf0',
											enable: { while: '.is_transition' },
											content: { kf0: true } as any,
										},
									],
								},
							],
						},
					},
				},
			]),
		}

		// No transition piece
		const objects = findLookaheadObjectsForPart(currentPartInstanceId, layer0, undefined, partInfo, partInstanceId)
		expect(stripObjectProperties(objects, true)).toStrictEqual([
			{
				id: 'obj0',
				layer: 'layer0',
				pieceInstanceId: 'piece0_instance',
				partInstanceId: partInstanceId,
				infinitePieceInstanceId: undefined,
				content: {
					deviceType: 0,
				},
			},
			{
				id: 'obj1',
				layer: 'layer0',
				pieceInstanceId: 'piece1_instance',
				partInstanceId: partInstanceId,
				infinitePieceInstanceId: undefined,
				content: {
					deviceType: 0,
				},
			},
		])

		// Allowed transition
		const previousPart: Part = { disableOutTransition: false, classesForNext: undefined } as any
		const objects1 = findLookaheadObjectsForPart(
			currentPartInstanceId,
			layer0,
			previousPart,
			partInfo,
			partInstanceId
		)
		expect(stripObjectProperties(objects1, true)).toStrictEqual(stripObjectProperties(objects, true))

		// Allowed transition with a transition
		partInfo.pieces.push({
			...defaultPieceInstanceProps,
			_id: protectString('piece2'),
			rundownId: rundownId,
			piece: {
				...defaultPieceInstanceProps.piece,
				isTransition: true,
				// content: {
				// 	timelineObjects: [
				// 		{
				// 			id: 'trans0',
				// 			enable: { start: 0 },
				// 			layer: layer0,
				// 			content: { deviceType: TSR.DeviceType.ABSTRACT },
				// 		},
				// 	],
				// },
			},
		})
		const objects2 = findLookaheadObjectsForPart(
			currentPartInstanceId,
			layer0,
			previousPart,
			partInfo,
			partInstanceId
		)
		expect(stripObjectProperties(objects2, true)).toStrictEqual([
			{
				id: 'obj0',
				layer: 'layer0',
				pieceInstanceId: 'piece0_instance',
				partInstanceId: partInstanceId,
				infinitePieceInstanceId: undefined,
				content: {
					deviceType: 0,
					kf2: true,
				},
			},
			{
				id: 'obj1',
				layer: 'layer0',
				pieceInstanceId: 'piece1_instance',
				partInstanceId: partInstanceId,
				infinitePieceInstanceId: undefined,
				content: {
					deviceType: 0,
					kf0: true,
				},
			},
		])

		// No previous should still allow it
		const objects3 = findLookaheadObjectsForPart(currentPartInstanceId, layer0, undefined, partInfo, partInstanceId)
		expect(stripObjectProperties(objects3, true)).toStrictEqual(stripObjectProperties(objects1, true))

		// Previous disables transition
		const blockedPreviousPart: Part = { disableOutTransition: true, classesForNext: undefined } as any
		const objects4 = findLookaheadObjectsForPart(
			currentPartInstanceId,
			layer0,
			blockedPreviousPart,
			partInfo,
			partInstanceId
		)
		expect(stripObjectProperties(objects4, true)).toStrictEqual(stripObjectProperties(objects1, true))
	})

	test('multiple object including transition', () => {
		const rundownId: RundownId = protectString('rundown0')
		const layer0 = 'layer0'
		const partInstanceId = protectString('partInstance0')
		const currentPartInstanceId: PartInstanceId | null = partInstanceId

		const partInfo = {
			part: definePart(rundownId),
			pieces: sortPieceInstancesByStart(
				literal<PieceInstance[]>([
					{
						...defaultPieceInstanceProps,
						rundownId: rundownId,
						piece: {
							...defaultPieceInstanceProps.piece,
							content: {
								timelineObjects: [
									{
										id: 'obj0',
										enable: { start: 0 },
										layer: layer0,
										content: { deviceType: TSR.DeviceType.ABSTRACT },
										keyframes: [
											{
												id: 'kf0',
												enable: { start: 0 },
												content: { kf0: true } as any,
											},
											{
												id: 'kf1',
												enable: { while: 1 },
												content: { kf1: true } as any,
											},
											{
												id: 'kf2',
												enable: { while: '.is_transition' },
												content: { kf2: true } as any,
											},
										],
									},
								],
							},
						},
					},
					{
						...defaultPieceInstanceProps,
						_id: protectString('piece1_instance'),
						rundownId: rundownId,
						piece: {
							...defaultPieceInstanceProps.piece,
							_id: protectString('piece1'),
							enable: { start: 1000 },
							content: {
								timelineObjects: [
									{
										id: 'obj1',
										enable: { start: 0 },
										layer: layer0,
										content: { deviceType: TSR.DeviceType.ABSTRACT },
										keyframes: [
											{
												id: 'kf0',
												enable: { while: '.is_transition' },
												content: { kf0: true } as any,
											},
										],
									},
								],
							},
						},
					},
					{
						// Transition piece
						...defaultPieceInstanceProps,
						_id: protectString('piece2_instance'),
						rundownId: rundownId,
						piece: {
							...defaultPieceInstanceProps.piece,
							_id: protectString('piece2'),
							isTransition: true,
							content: {
								timelineObjects: [
									{
										id: 'trans0',
										enable: { start: 0 },
										layer: layer0,
										content: { deviceType: TSR.DeviceType.ABSTRACT },
									},
								],
							},
						},
					},
				]),
				0
			),
		}

		// Allowed transition
		const previousPart: Part = { disableOutTransition: false, classesForNext: undefined } as any
		const objects2 = findLookaheadObjectsForPart(
			currentPartInstanceId,
			layer0,
			previousPart,
			partInfo,
			partInstanceId
		)
		expect(stripObjectProperties(objects2, true)).toStrictEqual([
			{
				id: 'trans0',
				layer: 'layer0',
				pieceInstanceId: 'piece2_instance',
				partInstanceId: partInstanceId,
				infinitePieceInstanceId: undefined,
				content: {
					deviceType: 0,
				},
			},
			{
				id: 'obj1',
				layer: 'layer0',
				pieceInstanceId: 'piece1_instance',
				partInstanceId: partInstanceId,
				infinitePieceInstanceId: undefined,
				content: {
					deviceType: 0,
					kf0: true,
				},
			},
		])

		// No previous part
		const objects3 = findLookaheadObjectsForPart(currentPartInstanceId, layer0, undefined, partInfo, partInstanceId)
		expect(stripObjectProperties(objects3, true)).toStrictEqual([
			{
				id: 'obj0',
				layer: 'layer0',
				pieceInstanceId: 'piece0_instance',
				partInstanceId: partInstanceId,
				infinitePieceInstanceId: undefined,
				content: {
					deviceType: 0,
				},
			},
			{
				id: 'obj1',
				layer: 'layer0',
				pieceInstanceId: 'piece1_instance',
				partInstanceId: partInstanceId,
				infinitePieceInstanceId: undefined,
				content: {
					deviceType: 0,
				},
			},
		])
	})
})
