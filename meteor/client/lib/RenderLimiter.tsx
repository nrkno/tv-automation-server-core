import * as React from 'react'

type IWrappedComponent<IProps, IState> = new (props: IProps, state: IState) => React.Component<IProps, IState>

export function withRenderLimiter<IProps, IState>(
	shouldComponentUpdate: (currentProps: IProps, nextProps: IProps) => boolean
): (
	WrappedComponent: IWrappedComponent<IProps, IState>
) => new (props: IProps, context: any) => React.Component<IProps, IState> {
	return (WrappedComponent) => {
		return class WithRenderLimiterHOCComponent extends React.Component<IProps, IState> {
			shouldComponentUpdate(nextProps: IProps, _nextState: IState): boolean {
				return shouldComponentUpdate(this.props, nextProps)
			}

			render() {
				return <WrappedComponent {...this.props} />
			}
		}
	}
}
