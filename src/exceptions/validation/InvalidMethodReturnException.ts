import {Exception} from '../../lib/base/abstracts/Exception'

export class InvalidMethodReturnException extends Exception {
    public errno: number | string = 'E_INVALID_METHOD_RETURN'
}
