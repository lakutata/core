import {AsyncConstructor} from './async-constructor/AsyncConstructor.js'

export class BaseObject extends AsyncConstructor {
    constructor() {
        super(async (): Promise<void> => {
            //todo
        })
    }
}
