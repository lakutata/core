import {Application} from '../Core.js'
import pupa from 'pupa'
import {InvalidMethodAcceptException} from '../exceptions/InvalidMethodAcceptException.js'
import {Abcd} from './Abcd.js'
import {DTO} from '../lib/base/DTO.js'
import {Accept} from '../decorators/ValidationDecorators.js'
import {Validator} from '../Validator.js'

(async () => {
    // console.log(await new Application({
    //     id: 'test',
    //     name: 'test',
    //     timezone: 'Asia/Shanghai'
    // }).test({a: '1', b: 'dddddd', dd: 11}, '11', true))

    console.log(await new Application({
        id: 'test',
        name: 'test',
        timezone: 'Asia/Shanghai'
    }).test2({a: '1', b: 1, c: true}))

    class YY extends DTO {
        @Accept(Validator.String())
        public aa: string

        @Accept(Validator.String().required())
        public cc?: string

        @Accept(Validator.String().default('uuuu'))
        public dd?: string
    }

    class XX extends DTO {
        @Accept(Validator.Number())
        public bb
    }

    class BB {
        @Accept(YY)
        public test(opt: YY) {
            console.log('test output:', opt)
        }
    }

    // const test = YY.concat(XX)

    // console.log(YY.validate({aa: 'gggggg'},{stripUnknown:false}))
    // console.log(await YY.validateAsync({aa: 'gggggg'}))
    // YY.validate()
    // console.log(YY.schema().validate({aa:'aaaaa'}))

    const data: any = {aa: 'aaa',cc:'eeeee'}

    new BB().test(data)
    console.log('validate output:',await YY.validateAsync(data))

    // console.error(new InvalidMethodAcceptException('I love {a} and {b}', {a: 'bb', b: 'mm'}))
})()
