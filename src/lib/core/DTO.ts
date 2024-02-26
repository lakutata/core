import {DataValidator, DefaultValidationOptions} from '../base/internal/DataValidator.js'
import {ObjectSchema, Schema} from 'joi'
import {AppendAsyncConstructor} from '../base/async-constructor/Append.js'
import {
    DefineObjectAsDTO,
    GetObjectIndexSignatureSchemaByPrototype,
    GetObjectPropertySchemasByPrototype,
    GetObjectSchemaByConstructor,
    GetObjectSchemaByPrototype,
    GetObjectValidateOptions,
    ObjectPropertySchemaMap
} from '../base/internal/ObjectSchemaValidation.js'
import {InvalidValueException} from '../../exceptions/dto/InvalidValueException.js'
import {As} from '../base/func/As.js'
import {IsNativeFunction} from '../base/func/IsNativeFunction.js'

@(<ClassConstructor extends typeof DTO>(target: ClassConstructor) => DefineObjectAsDTO(target))
export class DTO extends DataValidator {

    #instantiated: boolean = false

    get #objectSchema(): Schema {
        return GetObjectSchemaByPrototype(this).pattern(DTO.String(), GetObjectIndexSignatureSchemaByPrototype(this)).options(GetObjectValidateOptions(this))
    }

    /**
     * Instantiate
     * @private
     */
    #instantiate: () => void = (): void => {
        this.#instantiated = true
    }

    constructor(props: Record<string, any> = {}, async: boolean = false) {
        super()
        //Create DTO proxy object
        const DTOInstanceProxy: this = new Proxy(this, {
            set: (target, prop: string | symbol, value, receiver): boolean => {
                if (this.#instantiated && typeof prop !== 'symbol') {
                    const objectPropertySchemaMap: ObjectPropertySchemaMap = GetObjectPropertySchemasByPrototype(this)
                    const indexSignatureSchema: Schema = GetObjectIndexSignatureSchemaByPrototype(this)
                    const propertySchema: Schema | undefined = objectPropertySchemaMap.get(prop)
                    let tmpObj: Record<string, any> = {}
                    tmpObj[prop] = value
                    if (propertySchema) {
                        value = DTO.validate(value, propertySchema, {
                            ...GetObjectValidateOptions(this),
                            noDefaults: true
                        })
                    } else {
                        tmpObj = DTO.validate(tmpObj, DTO.Object().pattern(DTO.String(), indexSignatureSchema), {
                            ...GetObjectValidateOptions(this),
                            noDefaults: true
                        })
                        value = tmpObj[prop]
                    }
                }
                return Reflect.set(target, prop, value, receiver)
            },
            deleteProperty: (target, prop: string | symbol): boolean => {
                if (this.#instantiated && typeof prop !== 'symbol' && !IsNativeFunction(target[prop])) {
                    const objectPropertySchemaMap: ObjectPropertySchemaMap = GetObjectPropertySchemasByPrototype(this)
                    const propertySchema: Schema | undefined = objectPropertySchemaMap.get(prop)
                    if (propertySchema) DTO.validate(undefined, propertySchema, {
                        ...GetObjectValidateOptions(this),
                        noDefaults: true
                    })
                }
                return Reflect.deleteProperty(target, prop)
            }
        })
        if (async) {
            AppendAsyncConstructor(DTOInstanceProxy, async (): Promise<void> => {
                try {
                    const validProps: Record<string, any> = await DTO.validateAsync(props, this.#objectSchema, DefaultValidationOptions)
                    Object.keys(validProps).forEach((propertyKey: string) => this[propertyKey] = validProps[propertyKey])
                } catch (e) {
                    throw new InvalidValueException((As<Error>(e).message))
                }
                this.#instantiate()
            })
        } else {
            try {
                const validProps: Record<string, any> = DTO.validate(props, this.#objectSchema, DefaultValidationOptions)
                Object.keys(validProps).forEach((propertyKey: string) => this[propertyKey] = validProps[propertyKey])
            } catch (e) {
                throw new InvalidValueException((As<Error>(e).message))
            }
            this.#instantiate()
            return DTOInstanceProxy
        }
    }

    [prop: string | symbol]: any

    /**
     * DTO schema
     * @constructor
     */
    public static Schema(): ObjectSchema {
        return GetObjectSchemaByConstructor(this)
    }
}
