import {ArraySchema, Schema, SchemaMap, ValidationError, ValidationOptions, Validator} from '../Validator.js'
import {DTO} from '../lib/base/DTO.js'
import {isAsyncFunction} from 'util/types'
import {InvalidMethodAcceptException} from '../exceptions/InvalidMethodAcceptException.js'
import {IConstructor} from '../interfaces/IConstructor.js'
import {DTO_CLASS, DTO_SCHEMAS} from '../constants/MetadataKey.js'
import {defaultValidationOptions} from '../constants/DefaultValue.js'
import {InvalidMethodReturnException} from '../exceptions/InvalidMethodReturnException.js'

type TFunction = (...args: any[]) => any | Promise<any>

/**
 * 属性参数验证
 * @constructor
 */
export function Accept(schema: Schema): (target: Object, propertyKey: string | symbol) => void
/**
 * 方法参数验证
 * @constructor
 */
export function Accept(argumentSchemas: Schema | Schema[], options?: ValidationOptions): (target: Object, propertyKey: string, descriptor: TypedPropertyDescriptor<TFunction>) => TypedPropertyDescriptor<TFunction>
export function Accept(DTOs: IConstructor<DTO> | IConstructor<DTO>[], options?: ValidationOptions): (target: Object, propertyKey: string, descriptor: TypedPropertyDescriptor<TFunction>) => TypedPropertyDescriptor<TFunction>
export function Accept(inp: Schema | Schema[] | IConstructor<DTO> | IConstructor<DTO>[], options?: ValidationOptions): any {
    return function (target: Object, propertyKey: string, descriptor: TypedPropertyDescriptor<TFunction> | undefined): TypedPropertyDescriptor<TFunction> | void {
        if (descriptor === undefined) {
            //属性修饰器
            const schema: Schema = inp as Schema
            if (!Reflect.hasOwnMetadata(DTO_SCHEMAS, target.constructor)) Reflect.defineMetadata(DTO_SCHEMAS, {}, target.constructor)
            const schemas: SchemaMap = Reflect.getOwnMetadata(DTO_SCHEMAS, target.constructor)
            schemas[propertyKey] = schema
            Reflect.defineMetadata(DTO_SCHEMAS, schemas, target.constructor)
        } else {
            //方法修饰器
            const inputs: (Schema | IConstructor<DTO>)[] = Array.isArray(inp) ? inp : [inp]
            const argumentSchemas: Schema[] = []
            inputs.forEach(input => {
                if (Reflect.hasMetadata(DTO_CLASS, input)) {
                    //DTO类的构造函数
                    argumentSchemas.push(Validator.Object(Reflect.getMetadata(DTO_SCHEMAS, input)))
                } else {
                    //Schema实例
                    argumentSchemas.push(input as Schema)
                }
            })
            options = options ? Object.assign({}, defaultValidationOptions, options) : defaultValidationOptions
            descriptor.writable = false
            const originalMethod: (...args: any[]) => any | Promise<any> = descriptor.value as any
            const schema: ArraySchema = Validator.Array().ordered(...argumentSchemas)
            const argumentSchemaLength: number = Array.isArray(argumentSchemas) ? argumentSchemas.length : 1
            if (isAsyncFunction(originalMethod)) {
                descriptor.value = async function (...args: any[]) {
                    try {
                        args = await schema.concat(Validator.Array().ordered(...new Array(args.length - argumentSchemaLength).fill(Validator.Any()))).validateAsync(args, options)
                    } catch (e) {
                        throw new InvalidMethodAcceptException('Method [{propertyKey}] accept argument {reason}', {
                            propertyKey: propertyKey,
                            reason: (e as Error).message
                        })
                    }
                    return originalMethod.apply(this, args)
                }
            } else {
                descriptor.value = function (...args: any[]) {
                    const {
                        error,
                        value
                    } = schema.concat(Validator.Array().ordered(...new Array(args.length - argumentSchemaLength).fill(Validator.Any()))).validate(args, options)
                    if (error) {
                        throw new InvalidMethodAcceptException('Method [{propertyKey}] accept argument {reason}', {
                            propertyKey: propertyKey,
                            reason: error.message
                        })
                    }
                    return originalMethod.apply(this, value)
                }
            }
            return descriptor
        }
    }
}

/**
 * 方法返回值验证
 * @param returnSchema
 * @param options
 * @constructor
 */
export function Return(returnSchema: Schema, options?: ValidationOptions): (target: Object, propertyKey: string, descriptor: TypedPropertyDescriptor<TFunction>) => TypedPropertyDescriptor<TFunction>
export function Return(DTO: IConstructor<DTO>, options?: ValidationOptions): (target: Object, propertyKey: string, descriptor: TypedPropertyDescriptor<TFunction>) => TypedPropertyDescriptor<TFunction>
export function Return(inp: Schema | IConstructor<DTO>, options?: ValidationOptions): any {
    return function (target: Object, propertyKey: string, descriptor: TypedPropertyDescriptor<TFunction>): TypedPropertyDescriptor<TFunction> | void {
        let schema: Schema
        if (Reflect.hasMetadata(DTO_CLASS, inp)) {
            //DTO类的构造函数
            schema = Validator.Object(Reflect.getMetadata(DTO_SCHEMAS, inp))
        } else {
            //Schema实例
            schema = inp as Schema
        }
        options = options ? Object.assign({}, defaultValidationOptions, options) : defaultValidationOptions
        descriptor.writable = false
        const originalMethod: (...args: any[]) => any | Promise<any> = descriptor.value as any
        if (isAsyncFunction(originalMethod)) {
            descriptor.value = async function (...args: any[]) {
                const asyncResult = await originalMethod.apply(this, args)
                try {
                    if (asyncResult === undefined) throw new Error('is undefined')
                    return await schema.validateAsync(asyncResult, options)
                } catch (e) {
                    throw new InvalidMethodReturnException('Method [{propertyKey}] return value {reason}', {
                        propertyKey: propertyKey,
                        reason: (e as Error).message
                    })
                }
            }
        } else {
            descriptor.value = function (...args: any[]) {
                const syncResult = originalMethod.apply(this, args)
                let {error, value} = schema.validate(syncResult, options)
                if (!error && syncResult === undefined) error = new Error('is undefined') as ValidationError
                if (error) {
                    throw new InvalidMethodReturnException('Method [{propertyKey}] return value {reason}', {
                        propertyKey: propertyKey,
                        reason: error.message
                    })
                }
                return value
            }
        }
        return descriptor
    }
}
