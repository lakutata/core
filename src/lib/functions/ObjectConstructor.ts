import {As} from './As.js'
import {type IConstructor} from '../../interfaces/IConstructor.js'

export function ObjectConstructor<ObjectPrototype extends Object>(target: ObjectPrototype): IConstructor<ObjectPrototype> {
    return As<IConstructor<ObjectPrototype>>(target.constructor)
}

