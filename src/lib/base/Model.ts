import {Component} from './Component'
import {InjectionProperties} from '../../types/InjectionProperties'
import {Lifetime} from '../../decorators/DependencyInjectionDecorators'
import {MODEL_PROPERTY_MAP} from '../../constants/MetadataKey'
import {As} from '../../exports/Utilities'
import {Helper} from '../../exports/Helper'

/**
 * 业务模型基类
 */
@Lifetime('SCOPED', false)
export class Model extends Component {

    /**
     * Constructor
     * @param properties
     */
    constructor(properties: InjectionProperties = {}) {
        super(properties)
        this.setInternalProperty('type', 'Model')
    }

    protected async __init(): Promise<void> {
        await super.__init()
        Reflect.defineMetadata(MODEL_PROPERTY_MAP, new Map<string, any>(), this)
        this.propertyNames().forEach(propertyKey => {
            As<Map<string, any>>(Reflect.getOwnMetadata(MODEL_PROPERTY_MAP, this))?.set(propertyKey, this[propertyKey])
            Object.defineProperty(this, propertyKey, {
                set: (newValue: any): void => {
                    const oldValue: any = As<Map<string, any>>(Reflect.getOwnMetadata(MODEL_PROPERTY_MAP, this))?.get(propertyKey)
                    if (Helper.IsEqual(oldValue, newValue)) {
                        As<Map<string, any>>(Reflect.getOwnMetadata(MODEL_PROPERTY_MAP, this))?.set(propertyKey, newValue)
                        this.emit('property-changed', propertyKey, newValue, oldValue)
                    }
                },
                get: (): any => {
                    if (!As<Map<string, any>>(Reflect.getOwnMetadata(MODEL_PROPERTY_MAP, this))?.has(propertyKey)) return undefined
                    return As<Map<string, any>>(Reflect.getOwnMetadata(MODEL_PROPERTY_MAP, this))?.get(propertyKey)
                }
            })
        })
    }

    /**
     * 模型系统销毁函数
     * @protected
     */
    protected async __destroy(): Promise<void> {
        if (Reflect.hasOwnMetadata(MODEL_PROPERTY_MAP, this)) {
            As<Map<string, any>>(Reflect.getOwnMetadata(MODEL_PROPERTY_MAP, this)).clear()
            Reflect.defineMetadata(MODEL_PROPERTY_MAP, undefined, this)
        }
        return super.__destroy()
    }

    public on(eventName: 'property-changed', listener: (propertyKey: string, newValue: any, oldValue: any) => void): this
    public on(eventName: string | symbol, listener: (...args: any[]) => void): this {
        return super.on(eventName, listener)
    }

    public once(eventName: 'property-changed', listener: (propertyKey: string, newValue: any, oldValue: any) => void): this
    public once(eventName: string | symbol, listener: (...args: any[]) => void): this {
        return super.once(eventName, listener)
    }

}
