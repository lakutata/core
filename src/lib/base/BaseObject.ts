import {AsyncConstructor} from 'async-constructor'
import {IConstructor} from '../../interfaces/IConstructor.js'
import {
    As,
    ConfigureObjectProperties,
    MergeSet,
    ParentConstructor,
    RandomString,
    ThrowIntoBlackHole
} from '../../Utilities.js'
import {
    DI_CONTAINER_CREATOR_CONSTRUCTOR,
    DI_TARGET_CONSTRUCTOR_CONFIGURABLE_OPTIONS,
    DI_TARGET_CONSTRUCTOR_CONFIGURABLE_ITEMS,
    DI_TARGET_CONSTRUCTOR_CONFIGURABLE_OBJECT,
    DI_TARGET_CONSTRUCTOR_INJECTS,
    OBJECT_INIT_MARK,
    DI_TARGET_CONSTRUCTOR_CONFIGURABLE_PROPERTY,
    DTO_CLASS,
    DTO_SCHEMAS,
    DI_TARGET_CONSTRUCTOR_CONFIGURABLE_OBJECT_NAME,
    DI_CONTAINER_INJECT_PROPERTIES,
    DI_CONTAINER_INJECT_IS_MODULE_GETTER,
    DI_TARGET_CONSTRUCTOR_SPECIAL_INJECTS,
    DI_CONTAINER_SPECIAL_INJECT_MODULE_GETTER,
    DI_CONTAINER_SPECIAL_INJECT_APP_GETTER,
    DI_CONTAINER_INJECT_IS_MODULE_GETTER_KEY,
    DI_CONTAINER_SPECIAL_INJECT_APP_GETTER_KEY, DI_TARGET_CONSTRUCTOR_LIFETIME, DI_TARGET_CONSTRUCTOR_LIFETIME_LOCK
} from '../../constants/MetadataKey.js'
import {MethodNotFoundException} from '../../exceptions/MethodNotFoundException.js'
import {ConfigurableOptions, Lifetime} from '../../decorators/DependencyInjectionDecorators.js'
import {Schema, Validator} from '../../Validator.js'
import {defaultValidationOptions} from '../../constants/DefaultValue.js'
import {InvalidConfigurableValueException} from '../../exceptions/InvalidConfigurableValueException.js'
import {InvalidValueException} from '../../exceptions/InvalidValueException.js'
import {SHA256} from '../../Hash.js'

@(() => {
    return <TFunction extends IConstructor<any>>(target: TFunction): TFunction => {
        const nonceStr: string = RandomString(16)
        Reflect.defineMetadata(DI_CONTAINER_SPECIAL_INJECT_APP_GETTER_KEY, SHA256(`APP_GETTER_KEY_${nonceStr}`).toString(), target)
        Reflect.defineMetadata(DI_CONTAINER_INJECT_IS_MODULE_GETTER_KEY, SHA256(`MODULE_GETTER_KEY_${nonceStr}`).toString(), target)
        return target
    }
})()
@Lifetime('TRANSIENT', false)
export class BaseObject extends AsyncConstructor {

    /**
     * Get instance's class name
     */
    public get className(): string {
        return this.constructor.name
    }

    /**
     * Constructor
     * @param properties
     */
    constructor(properties: Record<string, any> = {}) {
        super(async (): Promise<void> => {
            if (Reflect.getMetadata(DI_CONTAINER_CREATOR_CONSTRUCTOR, properties.constructor) || Reflect.getOwnMetadata(DI_CONTAINER_INJECT_PROPERTIES, properties)) {
                //对Inject修饰器所修饰的属性进行数据注入
                const resolveInjectPromises: Promise<void>[] = []
                const injectMappingMap: Map<string, string> | undefined = Reflect.getMetadata(DI_TARGET_CONSTRUCTOR_INJECTS, this.constructor)
                injectMappingMap?.forEach((injectKey: string, propertyKey: string): void => {
                    if (!Reflect.getOwnPropertyDescriptor(properties, injectKey)) return properties[injectKey]
                    Object.keys(properties).forEach((injectPropertyKey: string): void => {
                        if (injectPropertyKey === injectKey && this.hasProperty(propertyKey)) {
                            resolveInjectPromises
                                .push(new Promise((resolve, reject) =>
                                        (async (): Promise<any> => properties[injectPropertyKey])()
                                            .then(injectItem => resolve(this.setProperty(propertyKey, Reflect.getOwnMetadata(DI_CONTAINER_INJECT_IS_MODULE_GETTER, injectItem) ? injectItem() : injectItem)))
                                            .catch(reject)
                                    )
                                )
                        }
                    })
                })
                //注入特殊项目（实例所在模块实例、应用程序实例）
                const APP_GETTER_KEY: string = Reflect.getMetadata(DI_CONTAINER_SPECIAL_INJECT_APP_GETTER_KEY, BaseObject)
                const MODULE_GETTER_KEY: string = Reflect.getMetadata(DI_CONTAINER_INJECT_IS_MODULE_GETTER_KEY, BaseObject)
                if (Object.keys(properties).includes(APP_GETTER_KEY) && Object.keys(properties).includes(MODULE_GETTER_KEY)) {
                    const specialInjectMappingMap: Map<string, Symbol> | undefined = Reflect.getMetadata(DI_TARGET_CONSTRUCTOR_SPECIAL_INJECTS, this.constructor)
                    const moduleGetter = properties[MODULE_GETTER_KEY]
                    const appGetter = properties[APP_GETTER_KEY]
                    specialInjectMappingMap?.forEach((injectKey: Symbol, propertyKey: string): void => {
                        if (Reflect.getMetadata(DI_CONTAINER_SPECIAL_INJECT_MODULE_GETTER, moduleGetter) && injectKey === DI_CONTAINER_SPECIAL_INJECT_MODULE_GETTER) {
                            resolveInjectPromises
                                .push(new Promise((resolve, reject) =>
                                        (async (): Promise<any> => moduleGetter)()
                                            .then(getModule => resolve(this.setProperty(propertyKey, getModule())))
                                            .catch(reject)
                                    )
                                )
                        }
                        if (Reflect.getMetadata(DI_CONTAINER_SPECIAL_INJECT_APP_GETTER, appGetter) && injectKey === DI_CONTAINER_SPECIAL_INJECT_APP_GETTER) {
                            resolveInjectPromises
                                .push(new Promise((resolve, reject) =>
                                        (async (): Promise<any> => appGetter)()
                                            .then(getApp => resolve(this.setProperty(propertyKey, getApp())))
                                            .catch(reject)
                                    )
                                )
                        }
                    })
                }
                await Promise.all(resolveInjectPromises)
            } else {
                ConfigureObjectProperties(this, properties ? properties : {})
            }
            //对Configurable所修饰的对象进行数据注入
            const config: Record<string, any> | undefined = Reflect.getOwnMetadata(DI_TARGET_CONSTRUCTOR_CONFIGURABLE_OBJECT, this.constructor, Reflect.getOwnMetadata(DI_TARGET_CONSTRUCTOR_CONFIGURABLE_OBJECT_NAME, this))
            if (config) {
                const configurableOptionsMap: Map<string, ConfigurableOptions> = As<Map<string, ConfigurableOptions> | undefined>(Reflect.getOwnMetadata(DI_TARGET_CONSTRUCTOR_CONFIGURABLE_OPTIONS, this)) ? As<Map<string, ConfigurableOptions>>(Reflect.getOwnMetadata(DI_TARGET_CONSTRUCTOR_CONFIGURABLE_OPTIONS, this.constructor)) : new Map()
                let configurableItems: Set<string> | undefined = Reflect.getOwnMetadata(DI_TARGET_CONSTRUCTOR_CONFIGURABLE_ITEMS, this.constructor)
                let constructor: typeof this.constructor | null = this.constructor
                while (constructor = ParentConstructor(constructor)) {
                    const parentConfigurableItems: Set<string> | undefined = Reflect.getOwnMetadata(DI_TARGET_CONSTRUCTOR_CONFIGURABLE_ITEMS, constructor)
                    if (parentConfigurableItems) configurableItems = MergeSet(configurableItems ? configurableItems : new Set<string>(), parentConfigurableItems)
                    As<Map<string, ConfigurableOptions> | undefined>(Reflect.getOwnMetadata(DI_TARGET_CONSTRUCTOR_CONFIGURABLE_OPTIONS, constructor))?.forEach((options: ConfigurableOptions, propertyKey: string): void => {
                        if (!configurableOptionsMap.has(propertyKey)) configurableOptionsMap.set(propertyKey, options)
                    })
                }
                const configurableInitValueMap: Map<string, any> = new Map()
                configurableOptionsMap.forEach((options: ConfigurableOptions, propertyKey: string): void => {
                    configurableInitValueMap.set(propertyKey, this[propertyKey])
                    Object.defineProperty(this, propertyKey, {
                        set: (value: any): void => {
                            if (options.accept) {
                                const schema: Schema = Reflect.hasMetadata(DTO_CLASS, options.accept) ? Validator.Object(Reflect.getMetadata(DTO_SCHEMAS, options.accept)) : As<Schema>(options.accept)
                                options.acceptOptions = options.acceptOptions ? Object.assign({}, defaultValidationOptions, options.acceptOptions) : defaultValidationOptions
                                try {
                                    value = Validator.validate(value, schema, options.acceptOptions)
                                } catch (e) {
                                    throw new InvalidConfigurableValueException('{className}\'s property "{propertyKey}" validate error: {message}', {
                                        className: this.constructor.name,
                                        propertyKey: propertyKey,
                                        message: As<InvalidValueException>(e).errMsg
                                    })
                                }
                            }
                            Reflect.defineMetadata(DI_TARGET_CONSTRUCTOR_CONFIGURABLE_PROPERTY, value, this, propertyKey)
                            if (options.onSet) options.onSet.call(this, value)
                        },
                        get(): any {
                            const value: any = Reflect.getOwnMetadata(DI_TARGET_CONSTRUCTOR_CONFIGURABLE_PROPERTY, this, propertyKey)
                            if (options.onGet) options.onGet.call(this, value)
                            return value
                        }
                    })
                })
                if (configurableItems) configurableItems.forEach((propertyKey: string): void => this[propertyKey] = Object.hasOwn(config, propertyKey) ? config[propertyKey] : configurableInitValueMap.get(propertyKey))
            }
            await this.init()
            Reflect.defineMetadata(OBJECT_INIT_MARK, true, this)
        })
    }

    /**
     * Internal destroy function
     * @protected
     */
    protected async __destroy(): Promise<void> {
        //To be override in child class
    }

    /**
     * Initialize function
     * @protected
     */
    protected async init(): Promise<void> {
        //To be override in child class
    }

    /**
     * Destroy function
     * @protected
     */
    protected async destroy(): Promise<void> {
        //To be override in child class
    }

    /**
     * Set object property
     * @param propertyKey
     * @param value
     */
    public setProperty(propertyKey: string, value: any): void {
        this[propertyKey] = value
    }

    /**
     * Get object's property value
     * @param propertyKey
     * @param defaultValue
     */
    public getProperty<T = any>(propertyKey: string, defaultValue?: T): T {
        if (this.hasProperty(propertyKey)) return As<T>(this[propertyKey])
        return As<T>(defaultValue)
    }

    /**
     * Is object has property
     * @param propertyKey
     */
    public hasProperty(propertyKey: string): boolean {
        return As(this).hasOwnProperty(propertyKey) || this[propertyKey] !== undefined
    }

    /**
     * Is object has method
     * @param name
     */
    public hasMethod(name: string): boolean {
        const propertyExists: boolean = this.hasProperty(name)
        if (!propertyExists) return false
        return typeof this.getProperty(name) === 'function'
    }

    /**
     * Get method from object
     * @param name
     * @param throwExceptionIfNotFound
     */
    public getMethod(name: string, throwExceptionIfNotFound: boolean = false): (...args: any[]) => any | Promise<any> {
        if (this.hasMethod(name)) {
            return (...args: any[]) => this[name](...args)
        } else if (throwExceptionIfNotFound) {
            throw new MethodNotFoundException('Method "{methodName}" not found in "{className}"', {
                methodName: name,
                className: this.constructor.name
            })
        } else {
            return (...args: any[]): void => ThrowIntoBlackHole(...args)
        }
    }

    /**
     * Return class's name
     */
    public static className(): string {
        return this.name
    }

    /**
     * Return class's lifetime mode
     */
    public static get __LIFETIME(): 'SINGLETON' | 'TRANSIENT' | 'SCOPED' {
        return Reflect.getMetadata(DI_TARGET_CONSTRUCTOR_LIFETIME, this)
    }

    /**
     * Return class's lifetime mode is locked
     */
    public static get __LIFETIME_LOCKED(): boolean {
        return !!Reflect.getMetadata(DI_TARGET_CONSTRUCTOR_LIFETIME_LOCK, this)
    }
}
