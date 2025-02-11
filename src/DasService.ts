import FetchProvider from './FetchProvider'
import { NamingService } from './NamingService'
import ConfigurationError, { ConfigurationErrorCode } from './errors/configurationError'
import ResolutionError, { ResolutionErrorCode } from './errors/resolutionError'
import {
  AccountData,
  AccountDataCell,
  AccountRecord,
  AccountRecordType, AccountRecordTypes,
} from './types/AccountData'
import { BlockchainNetworkUrlMap, DasSupportedNetwork } from './types/index'
import {
  CryptoRecords,
  DasSource,
  NamingServiceName,
  Provider,
  ResolutionMethod,
} from './types/publicTypes'

export interface ConstructedAccount {
  account: string,
  avatar: string,

  profile: Record<string, AccountRecord>,
  address: Record<string, AccountRecord>,
  dweb: Record<string, AccountRecord>,
  custom: Record<string, AccountRecord>,

  profiles: AccountRecord[],
  addresses: AccountRecord[],
  dwebs: AccountRecord[],
  customs: AccountRecord[],

  records: AccountRecord[],
}

export class DasService extends NamingService {
  static readonly UrlMap: BlockchainNetworkUrlMap = {
    'mainnet': 'https://indexer.da.systems',
    'testnet': 'http://47.243.90.165:8223',
    'aggron': 'http://47.243.90.165:8223',
  }

  readonly name = NamingServiceName.DAS
  readonly network: string // check if there is some numeric network id todo:
  readonly url: string | undefined
  readonly provider: Provider // temporarily not in use todo:

  constructor (source: DasSource = {}) {
    super();

    if (!(source.url || source.provider)) {
      throw new ConfigurationError(ConfigurationErrorCode.UnspecifiedUrl, {
        method: NamingServiceName.DAS
      })
    }

    if (!source.network) {
      source.network = 'mainnet'
    }

    if (!DasSupportedNetwork.guard(source.network)) {
      throw new ConfigurationError(ConfigurationErrorCode.UnsupportedNetwork, {
        method: NamingServiceName.DAS,
      })
    }

    this.network = source.network
    this.url = source.url
    this.provider = source.provider || new FetchProvider(this.name, this.url as string)
  }

  static async autonetwork(source?: DasSource): Promise<DasService> {
    if (!source) {
      source = {
        url: DasService.UrlMap['mainnet'],
        network: 'mainnet'
      }
    }
    else if (source.network && !source.url) {
      source.url = DasService.UrlMap[source.network]
    }

    return new DasService(source)
  }

  serviceName (): ResolutionMethod {
    return this.name
  }

  isSupportedDomain (account: string): boolean {
    return /.+\.bit/.test(account) && account.split('.').every(v => Boolean(v.length))
  }

  // todo: implement namehash
  namehash (account: string): string {
    if (!this.isSupportedDomain(account)) {
      throw new ResolutionError(ResolutionErrorCode.UnregisteredDomain, {
        domain: account,
      })
    }

    return ''
  }

  childhash (_parentHash: string, label: string): string {
    throw new ResolutionError(ResolutionErrorCode.UnsupportedMethod, {
      domain: label,
      methodName: 'childhash'
    })
  }

  async owner (account: string): Promise<string> {
    const accountData = await this.getAccountData(account)

    return accountData.owner_lock_args_hex
  }

  async resolver (account: string): Promise<string> {
    throw new ResolutionError(ResolutionErrorCode.UnsupportedMethod, {
      domain: account,
      methodName: 'resolver',
    })
  }

  async record(account: string, key: string): Promise<string> {
    key = key.toLowerCase()
    const returnee = (await this.allRecords(account))[key]

    if (!returnee) {
      throw new ResolutionError(ResolutionErrorCode.RecordNotFound, {
        domain: account,
        recordName: key,
      })
    }

    return returnee
  }

  async records (account: string, keys: string[]): Promise<CryptoRecords> {
    const records = await this.allRecords(account)

    return keys.reduce((returnee: Record<string, string>, key) => {
      returnee[key] = records[key] || ''
      return returnee
    }, {})
  }

  async allRecords (account: string): Promise<Record<string, string>> {
    const data = await this.getAccountData(account)

    if (data) {
      const records: {key: string, value: string}[] = data.records

      const returnee: CryptoRecords = {}

      records.forEach(record => {
        returnee[record.key.toLowerCase()] = record.value
      })

      return returnee
    }
    // no records
    else {
      return {}
    }
  }

  async reverse(address: string, currencyTicker: string): Promise<string | null> {
    if (!['ETH', 'CKB'].includes(currencyTicker)) {
      throw new Error('Das does not support any chain other than CKB and ETH')
    }

    const accounts = await this.allReverse(address)

    return accounts[0]
  }

  async isRegistered(account: string): Promise<boolean> {
    const accountData = await this.getAccountData(account);

    return Boolean(accountData);
  }

  twitter (account: string): Promise<string> {
    throw new ResolutionError(ResolutionErrorCode.UnsupportedMethod, {
      domain: account,
      methodName: 'twitter'
    })
  }
  /* -------- custom methods --------- */

  /**
   * return all the records for the give key
   * @param account
   * @param key
   */
  async recordsByKey(account: string, key: string): Promise<AccountRecord[]> {
    const accountData = await this.getAccountData(account)

    return await accountData.records.filter(record => record.key === key)
  }

  async addr(account: string, ticker: string) {
    return await this.record(account, `address.${ticker}`)
  }

  async account(account: string) {
    const accountData = await this.getAccountData(account)

    const profiles = accountData.records.filter(record => record.type === AccountRecordTypes.profile)
    const addresses = accountData.records.filter(record => record.type === AccountRecordTypes.address)
    const dwebs = accountData.records.filter(record => record.type === AccountRecordTypes.dweb)
    const customs = accountData.records.filter(record => record.type === AccountRecordTypes.custom)

    function resolveOneFromRecords(records: AccountRecord[]) {
      return records.reduce((profile, record) => {
        profile[record.strippedKey] = record
        return profile
      }, {} as Record<string, AccountRecord>)
    }

    return {
      account: accountData.account,
      avatar: `https://identicons.da.systems/identicon/${account}`,

      profile: resolveOneFromRecords(profiles),
      address: resolveOneFromRecords(addresses),
      dweb: resolveOneFromRecords(dwebs),
      custom: resolveOneFromRecords(customs),

      profiles,
      addresses,
      dwebs,
      customs,

      records: accountData.records,
    }
  }

  async allReverse(address: string): Promise<string[]> {
    const data = await this.provider.request({
      method: 'das_getAddressAccount',
      params: [address],
    }) as any

    const accounts: { account: string }[] = data.data.account_data

    return accounts.map(account => account.account)
  }

  async getAccountData(account: string): Promise<AccountData> {
    const data = await this.provider.request({
      method: 'das_searchAccount',
      params: [
        account,
      ]
    }) as {data: AccountDataCell}

    if (!data.data) {
      throw new ResolutionError(ResolutionErrorCode.UnregisteredDomain, {
        domain: account,
      });
    }

    data.data.account_data.records.forEach(record => {
      // the raw data is string, '300'
      record.ttl = Number(record.ttl)
      const keyParts = record.key.split('.')
      const type = keyParts.shift() as AccountRecordType
      const strippedKey = keyParts.join('.')

      record.type = type
      record.strippedKey = strippedKey
    })

    return data.data.account_data
  }
}
