import React, { useState } from 'react'
import { RundownPlaylist } from '../../lib/collections/RundownPlaylists'
import { useTranslation } from 'react-i18next'
import { EditAttribute } from '../lib/EditAttribute'
import { EvaluationBase } from '../../lib/collections/Evaluations'
import { doUserAction, UserAction } from '../lib/userAction'
import { MeteorCall } from '../../lib/api/methods'
import { SnapshotId } from '../../lib/collections/Snapshots'

interface IProps {
	playlist: RundownPlaylist
}

const DEFAULT_STATE = {
	q0: 'nothing',
	q1: '',
	q2: '',
}

export function AfterBroadcastForm(props: IProps) {
	const { t } = useTranslation()
	const shouldDeactivateRundown = !props.playlist.loop
	const [obj, setObj] = useState(DEFAULT_STATE)

	function saveForm(e: React.MouseEvent<HTMLElement>) {
		const answers = obj

		const saveEvaluation = (snapshotId?: SnapshotId) => {
			const evaluation: EvaluationBase = {
				studioId: props.playlist.studioId,
				playlistId: props.playlist._id,
				answers: answers,
			}
			if (snapshotId && evaluation.snapshots) evaluation.snapshots.push(snapshotId)

			doUserAction(t, e, UserAction.SAVE_EVALUATION, (e) => MeteorCall.userAction.saveEvaluation(e, evaluation))

			if (shouldDeactivateRundown) {
				doUserAction(t, e, UserAction.DEACTIVATE_RUNDOWN_PLAYLIST, (e) =>
					MeteorCall.userAction.deactivate(e, props.playlist._id)
				)
			}

			setObj({
				...DEFAULT_STATE,
			})
		}

		if (answers.q0 !== 'nothing') {
			doUserAction(
				t,
				e,
				UserAction.CREATE_SNAPSHOT_FOR_DEBUG,
				(e) => MeteorCall.userAction.storeRundownSnapshot(e, props.playlist._id, 'Evaluation form'),
				(err, snapshotId) => {
					if (!err && snapshotId) {
						saveEvaluation(snapshotId)
					} else {
						saveEvaluation()
					}
				}
			)
		} else {
			saveEvaluation()
		}
	}

	function onUpdateValue(edit: any, newValue: any) {
		const attr = edit.props.attribute

		if (attr) {
			setObj({
				...obj,
				[attr]: newValue,
			})
		}
	}

	return (
		<div className="afterbroadcastform-container">
			<div className="afterbroadcastform">
				<h2>{t('Evaluation')}</h2>

				<p>
					<em>{t('Please take a minute to fill in this form.')}</em>
				</p>

				<div className="form">
					<div className="question">
						<p>{t('Did you have any problems with the broadcast?')}</p>
						<div className="input q0">
							<EditAttribute
								obj={obj}
								updateFunction={onUpdateValue}
								attribute="q0"
								type="dropdown"
								options={getQuestionOptions(t)}
							/>
						</div>
					</div>
					<div className="question q1">
						<p>
							{t(
								'Please explain the problems you experienced (what happened and when, what should have happened, what could have triggered the problems, etcetera...)'
							)}
						</p>
						<div className="input">
							<EditAttribute obj={obj} updateFunction={onUpdateValue} attribute="q1" type="multiline" />
						</div>
					</div>
					<div className="question q2">
						<p>{t('Your name')}</p>
						<div className="input">
							<EditAttribute obj={obj} updateFunction={onUpdateValue} attribute="q2" type="text" />
						</div>
					</div>

					<button className="btn btn-primary" onClick={saveForm}>
						{!shouldDeactivateRundown ? t('Save message') : t('Save message and Deactivate Rundown')}
					</button>
				</div>
			</div>
		</div>
	)
}

export function getQuestionOptions(t) {
	return [
		{ value: 'nothing', name: t('No problems') },
		{ value: 'minor', name: t("Something went wrong, but it didn't affect the output") },
		{ value: 'major', name: t('Something went wrong, and it affected the output') },
	]
}
