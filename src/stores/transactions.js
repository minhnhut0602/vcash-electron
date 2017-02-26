import { action, computed, observable, reaction } from 'mobx'
import { notification } from 'antd'
import i18next from '../utilities/i18next'
import moment from 'moment'

/** Required store instances. */
import rpc from './rpc'
import rates from './rates'
import ui from './ui'

class Transactions {
  /**
   * Observable properties.
   * @property {map} txids - Transactions RPC responses.
   * @property {array} search - Search txs using these keywords.
   * @property {string|null} viewing - Transaction being viewed.
   * @property {string|null} viewingQueue - Tx waiting to be viewed (just sent).
   */
  @observable txids = observable.map({})
  @observable search = observable.array([])
  @observable viewing = null
  @observable viewingQueue = null

  /**
   * @constructor
   * @property {number|null} loopTimeout - setTimeout id of this.loop().
   * @property {string} sinceBlock - List txs since this block.
   */
  constructor () {
    this.loopTimeout = null
    this.sinceBlock = ''

    /** Start update loop when RPC becomes available. */
    reaction(() => rpc.status, (status) => {
      if (status === true) {
        this.restartLoop()
      }
    })

    /** Check if there's a sent transaction waiting to be viewed. */
    reaction(() => this.txids.size, (size) => {
      if (this.viewingQueue !== null) {
        this.setViewing(this.viewingQueue)
      }
    })
  }

  /**
   * Get transactions data for table use.
   * @function tableData
   * @return {array} Table data.
   */
  @computed get tableData () {
    let txs = []

    this.txids.forEach((tx, txid) => {
      let keywordMatches = 0

      const amount = new Intl.NumberFormat(ui.language, {
        minimumFractionDigits: 6,
        maximumFractionDigits: 6
      }).format(tx.amount)

      const amountLocal = new Intl.NumberFormat(ui.language, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(tx.amount * rates.average * rates.local)

      /** Increment keywordMatches by 1 each time a keyword matches. */
      this.search.forEach((keyword) => {
        if (
          amount.indexOf(keyword) > -1 ||
          amountLocal.indexOf(keyword) > -1 ||
          i18next.t('wallet:' + tx.category).indexOf(keyword) > -1 ||
          tx.blockhash && tx.blockhash.indexOf(keyword) > -1 ||
          tx.comment && tx.comment.indexOf(keyword) > -1 ||
          tx.txid.indexOf(keyword) > -1 ||
          moment(tx.time).format('l - HH:mm:ss').indexOf(keyword) > -1
         ) {
          keywordMatches += 1
        }
      })

      /** Push txs with match count equal to the number of keywords. */
      if (keywordMatches === this.search.length) {
        txs.push({
          key: tx.txid,
          amount,
          amountLocal,
          category: tx.category,
          color: tx.color,
          comment: tx.comment || '',
          time: tx.time,
          txid: tx.txid
        })
      }
    })

    /** Sort by date. */
    return txs.sort((a, b) => {
      if (a.time > b.time) return -1
      if (a.time < b.time) return 1
      return 0
    })
  }

  /**
   * Get transactions data for chart use.
   * @function chartData
   * @return {array} Chart data.
   */
  @computed get chartData () {
    /** Today - 31 days. */
    const threshold = new Date().getTime() - (31 * 24 * 60 * 60 * 1000)

    const today = moment(new Date())
    let data = []
    let dataByDate = []

    for (let i = 0; i < 31; i++) {
      const date = i === 0
        ? today.format('L')
        : today.subtract(1, 'day').format('L')

      /** Add to the beginning of arrays. */
      dataByDate.unshift(date)
      data.unshift({
        date,
        [i18next.t('wallet:sent')]: 0,
        [i18next.t('wallet:received')]: 0,
        [i18next.t('wallet:stakingReward')]: 0,
        [i18next.t('wallet:miningReward')]: 0,
        [i18next.t('wallet:incentiveReward')]: 0
      })
    }

    this.txids.forEach((tx, txid) => {
      /** Check if time is in the last 31 days window. */
      if (tx.time > threshold) {
        const txDate = moment(tx.time).format('L')
        const index = dataByDate.indexOf(txDate)

        if (index > -1) {
          const category = i18next.t('wallet:' + tx.category)

          if (data[index].hasOwnProperty(category) === true) {
            data[index][category] += Math.round(Math.abs(tx.amount) * 1e6) / 1e6
          }
        }
      }
    })

    return data
  }

  /**
   * Get generated transactions.
   * @function generated
   * @return {array} Generated transactions.
   */
  @computed get generated () {
    let generated = []

    this.txids.forEach((tx, txid) => {
      if (tx.hasOwnProperty('generated') === true) {
        generated.push(tx)
      }
    })

    /** Sort by date. */
    return generated.sort((a, b) => {
      if (a.time > b.time) return -1
      if (a.time < b.time) return 1
      return 0
    })
  }

  /**
   * Get pending generated transactions.
   * @function generatedPending
   * @return {map} Generated pending transactions.
   */
  @computed get generatedPending () {
    return this.generated.reduce((pending, tx) => {
      if (
        tx.confirmations > 0 &&
        tx.confirmations <= 220
      ) {
        pending.set(tx.txid, tx)
      }

      return pending
    }, new Map())
  }

  /** */
  @computed get rewardSpread () {
    /** */
  }

  /** */
  @computed get rewardsPerDay () {
    /** */
  }

  /**
   * Get pending amount.
   * @function pendingAmount
   * @return {number} Amount pending.
   */
  @computed get pendingAmount () {
    let pending = 0

    this.txids.forEach((tx, txid) => {
      if (
        tx.confirmations === 0 &&
        tx.category === 'receiving' ||
        tx.category === 'sending' ||
        tx.category === 'sendingToSelf' ||
        tx.category === 'blending'
      ) {
        pending = pending + Math.abs(tx.amount)
      }
    })

    return pending
  }

  /**
   * Get data of the transaction being viewed.
   * @function viewingTx
   * @return {object|null} Transaction data or null.
   */
  @computed get viewingTx () {
    if (this.txids.has(this.viewing) === true) {
      return this.txids.get(this.viewing)
    }

    return null
  }

  /**
   * Set txid of the transaction being viewed.
   * @function setViewing
   * @param {string} txid - Transaction id.
   */
  @action setViewing (txid = null) {
    /** Lookup a transaction that was just sent. */
    if (
      txid !== null &&
      this.txids.has(txid) === false
    ) {
      /** Save the txid in viewing queue. */
      this.viewingQueue = txid

      /** Re-start the loop from the last known block. */
      this.restartLoop(true)
    } else {
      this.viewing = txid

      /** Clear viewing queue if not null. */
      if (this.viewingQueue !== null) {
        this.viewingQueue = null
      }
    }
  }

  /**
   * Set transactions.
   * @function setTransactions
   * @param {array} transactions - Transactions lookups.
   * @param {array} inputs - Transactions inputs.
   */
  @action setTransactions (transactions, inputs = null) {
    /** Convert inputs array to a map for faster lookups. */
    if (inputs !== null) {
      inputs = inputs.reduce((inputs, transaction) => {
        if (transaction.hasOwnProperty('result') === true) {
          inputs.set(transaction.result.txid, transaction.result)
        }

        return inputs
      }, new Map())
    }

    /** Grouped notifications for pending and spendable txs. */
    let notifications = {
      pending: new Map(),
      spendable: new Map()
    }

    /** Go through transactions and make adjustments. */
    transactions.forEach((tx) => {
      tx = tx.result

      /** Get saved status. */
      const isSaved = this.txids.has(tx.txid)

      /** Determine which tx to alter. */
      let save = isSaved === false
        ? tx
        : this.txids.get(tx.txid)

      /** Update ztlock. */
      if (tx.hasOwnProperty('ztlock') === true) {
        save.ztlock = tx.ztlock
      }

      /** Skip updating if confirmations haven't changed. */
      if (isSaved === true) {
        if (save.confirmations === tx.confirmations) return
      }

      /** Set inputs only on new transactions. */
      if (inputs !== null) {
        if (isSaved === false) {
          tx.inputs = []

          for (let i = 0; i < tx.vin.length; i++) {
            if (inputs.has(tx.vin[i].txid) === true) {
              const input = inputs.get(tx.vin[i].txid)

              /** Set value and address of the input transaction to each vin. */
              tx.vin[i].value = input.vout[tx.vin[i].vout].value
              tx.vin[i].address = input.vout[tx.vin[i].vout].scriptPubKey.addresses[0]

              /** Address and amount tuples for use in tables. */
              tx.inputs.push({
                address: input.vout[tx.vin[i].vout].scriptPubKey.addresses[0],
                value: input.vout[tx.vin[i].vout].value
              })
            }
          }
        }
      }

      /** Set outputs only on new transactions. */
      if (isSaved === false) {
        /** Address and amount tuples for use in tables. */
        tx.outputs = tx.vout.reduce((outputs, output) => {
          if (output.scriptPubKey.type !== 'nonstandard') {
            outputs.push({
              address: output.scriptPubKey.addresses[0],
              value: output.value
            })
          }

          return outputs
        }, [])
      }

      /** Determine amount color. */
      save.color = tx.hasOwnProperty('generated') === true
        ? tx.confirmations < 220
          ? 'orange'
          : 'green'
        : tx.confirmations === 0
          ? 'orange'
          : tx.amount > 0
            ? 'green'
            : 'red'

      /** Convert time to miliseconds. */
      if (tx.hasOwnProperty('time') === true) {
        save.time = tx.time * 1000
      }

      /** Convert blocktime to miliseconds. */
      if (tx.hasOwnProperty('blocktime') === true) {
        save.blocktime = tx.blocktime * 1000
      }

      /** Convert timereceived to miliseconds. */
      if (tx.hasOwnProperty('timereceived') === true) {
        save.timereceived = tx.timereceived * 1000
      }

      /** Set blockhash if found in block. */
      if (tx.hasOwnProperty('blockhash') === true) {
        if (
          isSaved === false ||
          save.blockhash !== tx.blockhash
        ) {
          save.blockhash = tx.blockhash
        }
      }

      /** Process transactions with details property. */
      if (tx.hasOwnProperty('details') === true) {
        /** Process PoW, PoS and Incentive reward transactions. */
        if (tx.hasOwnProperty('generated') === true) {
          /** Proof-of-Stake reward. */
          if (tx.vout[0].scriptPubKey.type === 'nonstandard') {
            save.category = 'stakingReward'
          }

          if (tx.vin[0].hasOwnProperty('coinbase') === true) {
            /** Proof-of-Work reward. */
            if (tx.details[0].address === tx.vout[0].scriptPubKey.addresses[0]) {
              save.category = 'miningReward'
            }

            /** Incentive reward. */
            if (tx.details[0].address === tx.vout[1].scriptPubKey.addresses[0]) {
              save.category = 'incentiveReward'
            }
          }

          /**
           * While < 220 confirmations:
           *  - PoW: tx.amount is zero.
           *  - PoS: tx.amount is negative to the sum
           *         of output amounts - stake reward.
           *  - Incentive: tx.amount is zero.
           *
           * During this time use the correct amount from tx.details.
           */
          if (tx.confirmations < 220) {
            if (isSaved === false) save.amount = tx.details[0].amount
          }
        }

        /** Process Sent to self and Received transactions. */
        if (tx.hasOwnProperty('generated') === false) {
          /** Received. */
          if (tx.amount !== 0) {
            if (tx.confirmations > 0) {
              save.category = 'received'
            } else {
              save.category = 'receiving'
            }
          }

          /** Sent to self. */
          if (tx.amount === 0) {
            if (tx.confirmations > 0) {
              save.category = 'sentToSelf'
            } else {
              save.category = 'sendingToSelf'
            }

            /** Calculate the sum of amounts in details. */
            if (isSaved === false) {
              tx.details.forEach((entry) => {
                save.amount += entry.amount
              })
            }
          }
        }
      }

      /** Type: sent. */
      if (tx.hasOwnProperty('fee') === true) {
        if (tx.amount < 0) {
          if (tx.confirmations > 0) {
            save.category = 'sent'
          } else {
            save.category = 'sending'
          }
        }
      }

      /** Type: blended. */
      if (tx.hasOwnProperty('blended') === true) {
        /** TODO: Loop outputs and find the address that is yours. */

        if (tx.confirmations > 0) {
          save.category = 'blended'
        } else {
          save.category = 'blending'
        }
      }

      /** Add pending amounts to notifications. */
      if (
        tx.confirmations === 0 &&
        tx.category !== 'sending'
      ) {
        /** Get total amount or return 0. */
        let total = notifications.pending.has(save.category) === true
          ? notifications.pending.get(save.category)
          : 0

        /** Add tx amount to the total. */
        notifications.pending.set(save.category, total + save.amount)
      }

      /** Add spendable amounts to notifications. */
      if (isSaved === true) {
        if (
          tx.confirmations === 1 ||
          tx.confirmations === 220 &&
          tx.hasOwnProperty('generated') === true
        ) {
          /** Get total amount or return 0. */
          let total = notifications.spendable.has(save.category) === true
            ? notifications.spendable.get(save.category)
            : 0

          /** Add tx amount to the total. */
          notifications.spendable.set(save.category, total + save.amount)
        }
      }

      /** Update confirmations. */
      save.confirmations = tx.confirmations

      /**
       * Add unsaved transactions to the map,
       * saved transactions update changed properties only.
       */
      if (isSaved === false) this.txids.set(save.txid, save)
    })

    /** Open notifications for pending transactions. */
    notifications.pending.forEach((total, category) => {
      /** Convert the amount to local notation. */
      total = new Intl.NumberFormat(ui.language, {
        minimumFractionDigits: 6,
        maximumFractionDigits: 6
      }).format(total)

      /** Open the notification. */
      notification.info({
        message: i18next.t('wallet:' + category),
        description: total + ' XVC ' + i18next.t('wallet:toBeConfirmed'),
        duration: 6
      })
    })

    /**
     * Open notification on confirmation change,
     * from 0 -> 1 and 219 -> 220 for generated.
     */
    notifications.spendable.forEach((total, category) => {
      /** Convert the amount to local notation. */
      total = new Intl.NumberFormat(ui.language, {
        minimumFractionDigits: 6,
        maximumFractionDigits: 6
      }).format(total)

      /** Open the notification. */
      notification.success({
        message: i18next.t('wallet:' + category),
        description: total + ' XVC ' + i18next.t('wallet:hasBeenConfirmed'),
        duration: 6
      })
    })
  }

  /**
   * Set searching keywords.
   * @function setSearch
   * @param {string} keywords - Keywords to search transactions by.
   */
  @action setSearch (keywords) {
    this.search = keywords.match(/[^ ]+/g) || []
  }

  /**
   * Clear current loop timeout.
   * @function clearLoopTimeout
   */
  @action clearLoopTimeout () {
    clearTimeout(this.loopTimeout)
    this.loopTimeout = null
  }

  /**
   * Start new loop and save its timeout id.
   * @function setLoopTimeout
   * @param {string} block - List since this blockhash.
   */
  @action setLoopTimeout (block) {
    this.sinceBlock = block

    /** Set loop timeout using provided blockhash. */
    this.loopTimeout = setTimeout(() => {
      this.loop(block)
    }, 10 * 1000)
  }

  /**
   * Restart the update loop.
   * @function restartLoop
   * @param {boolean} fromGenesis - Start from beginning?
   */
  restartLoop (fromGenesis = false) {
    this.clearLoopTimeout()

    if (fromGenesis === true) {
      this.loop(this.sinceBlock)
    } else {
      this.loop()
    }
  }

  /**
   * Lock transaction.
   * @function ztlock
   * @param {string} txid - Txid of the transaction to lock.
   */
  ztlock (txid) {
    rpc.call([
      {
        method: 'ztlock',
        params: [txid]
      }
    ], (response) => {
      if (response !== null) {
        /** Clear current loop. */
        this.clearLoopTimeout()

        /** Re-start the loop from the last known block. */
        this.loop(this.sinceBlock)
      }
    })
  }

  /**
   * Get transactions since provided block.
   * @param {string} Previous response blockhash.
   * @function loop
   */
  loop (block = '') {
    rpc.call([
      {
        method: 'listsinceblock',
        params: [block]
      },
      {
        method: 'getrawmempool',
        params: [true]
      }
    ], (response) => {
      if (response !== null) {
        let lsb = response[0].result
        let mempool = response[1].result

        /** Start new loop. */
        this.setLoopTimeout(lsb.lastblock)

        /** Add txid of the transaction being viewed. */
        if (this.viewing !== null) {
          lsb.transactions.push({
            txid: this.viewing,
            confirmations: this.viewingTx.confirmations
          })
        }

        /** Add pending generated txs (<= 220 conf). */
        if (this.generatedPending.size > 0) {
          this.generatedPending.forEach((tx, txid) => {
            lsb.transactions.push({
              txid: tx.txid,
              confirmations: tx.confirmations
            })
          })
        }

        /** Create RPC request options array. */
        const options = lsb.transactions.reduce((options, tx) => {
          /** Exclude orphaned transactions. */
          if (tx.confirmations !== -1) {
            options.push({
              method: 'gettransaction',
              params: [tx.txid]
            })
          }

          return options
        }, [])

        if (options.length > 0) {
          /** Get transactions. */
          rpc.call(options, (txs) => {
            /* Create RPC request options array. */
            const options = txs.reduce((options, tx) => {
              tx = tx.result

              /** Make sure there are transactions in mempool. */
              if (Array.isArray(mempool) === false) {
                /** Check if this transaction exists in mempool. */
                if (mempool.hasOwnProperty(tx.txid) === true) {
                  /** Add ztlock status. */
                  tx.ztlock = mempool[tx.txid].ztlock
                }
              }

              /** Lookup inputs of unsaved txs only. */
              if (this.txids.has(tx.txid) === false) {
                tx.vin.forEach((input) => {
                  if (input.hasOwnProperty('coinbase') === false) {
                    options.push({
                      method: 'gettransaction',
                      params: [input.txid]
                    })
                  }
                })
              }

              return options
            }, [])

            if (options.length === 0) {
              this.setTransactions(txs)
            } else {
              /** Lookup inputs. */
              rpc.call(options, (inputs) => {
                if (inputs !== null) {
                  this.setTransactions(txs, inputs)
                }
              })
            }
          })
        }
      }
    })
  }
}

/** Initialize a new globally used store. */
const transactions = new Transactions()

/**
 * Export initialized store as default export,
 * and store class as named export.
 */
export default transactions
export { Transactions }
