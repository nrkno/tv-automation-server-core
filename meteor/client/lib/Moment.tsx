import * as React from 'react'
import Moment, { MomentProps } from 'react-moment'
import moment from 'moment'
import { getCurrentTime } from '../../lib/lib'
import timer from 'react-timer-hoc'

/**
 * Use instead of <Moment fromNow></Moment>, its result is synced with getCurrentTime()
 * @param args same as for Moment
 */
export const MomentFromNow = timer(60000)(function MomentFromNow(args: MomentProps) {
	return <Moment {...args} from={moment(getCurrentTime())} interval={0}></Moment>
})
