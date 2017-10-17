import React from 'react'
import { translate } from 'react-i18next'
import { inject, observer } from 'mobx-react'

/** Ant Design */
import Button from 'antd/lib/button'
import Tooltip from 'antd/lib/tooltip'

@translate(['wallet'], { wait: true })
@inject('rpcNext', 'walletNext')
@observer
class WalletLock extends React.Component {
  constructor(props) {
    super(props)
    this.t = props.t
    this.rpc = props.rpcNext
    this.wallet = props.walletNext

    /** Bind the async function. */
    this.walletLock = this.walletLock.bind(this)
  }

  /**
   * Lock the wallet.
   * @function walletLock
   */
  async walletLock() {
    const res = await this.rpc.walletLock()

    if ('result' in res === true) {
      /** Update wallet's lock status. */
      this.wallet.updateLockStatus()
    }
  }

  render() {
    const { isEncrypted, isLocked } = this.wallet

    /** Do not render if the wallet is not encrypted or is locked. */
    if (isEncrypted === false || isLocked === true) return null
    return (
      <Tooltip placement="bottomRight" title={this.t('wallet:unlocked')}>
        <Button onClick={this.walletLock}>
          <i className="material-icons md-20">lock_open</i>
        </Button>
      </Tooltip>
    )
  }
}

export default WalletLock
