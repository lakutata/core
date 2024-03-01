import {BaseObject} from '../lib/base/BaseObject.js'

type BaseObjectConstructor = typeof BaseObject

export interface IConstructor<T> extends BaseObjectConstructor {
    new(...args: any[]): T

    [prop: string]: any
}
