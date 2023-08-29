import 'reflect-metadata'
import {Application, ConvertToStream, Formatter, HttpRequest, Logger, Time} from '../Lakutata'
import {TestObject} from './objects/TestObject'
import {TestInterval} from './intervals/TestInterval'
import {MDSTest1} from './mds/MDSTest1'
import {TestComponent} from './components/TestComponent'
import {TestModule1} from './modules/TestModule1/TestModule1'
import {Test1Controller} from './controllers/Test1Controller'
import {TestModel} from './models/TestModel'
import path from 'path'
import fs from 'fs'
import {Worker} from 'worker_threads'
import {fork} from 'child_process'
import {transpileModule} from 'typescript'
import Module from 'module'
import {TestProcess} from './processes/TestProcess'
import {TestCron} from './intervals/TestCron'
import * as zlib from 'zlib'
import v8 from 'v8'
import {TestThreadTask} from './threads/TestThreadTask'
import {newEnforcer} from 'casbin'
import {DomainRBAC} from '../lib/access-control/DomainRBAC'
import {AccessControl} from '../lib/access-control/AccessControl'

(async () => {

    const domainRBAC = new DomainRBAC()
    const enforcer = await newEnforcer(domainRBAC)

    await enforcer.addPolicy('myq', 'default', 'data1', 'get')
    await enforcer.addPolicy('myq', 'default', 'data2', 'post')
    await enforcer.addPolicy('user', 'default1', 'data3', 'get')
    await enforcer.addRoleForUser('myq', 'user', 'default1')
    // console.log(await enforcer.getPolicy())
    console.log(await enforcer.getRolesForUser('myq'))
    console.log(await enforcer.getAllRoles())
    console.log(await enforcer.getAllActions())
    // await enforcer.savePolicy()

    console.log('isAllow:', await enforcer.enforce('myq', 'default', 'data1', 'get'))


    console.log('##################@@@@@@@@@@@@Application.className:', Application.className)

    const compiled = transpileModule(fs.readFileSync(path.resolve(__dirname, './TestProc.ts'), {encoding: 'utf-8'}), {}).outputText

    // new Worker(path.resolve(__dirname, './TestProc.ts'))

    // fork(path.resolve(__dirname, './TestProc.ts'))

    console.time('app')
    await Application.run({
        id: 'test',
        name: 'test',
        timezone: 'Asia/Shanghai',
        // timezone: 'Africa/Accra',
        // mode: 'production',
        mode: 'development',
        entries: {
            testProc: {class: TestProcess, concurrent: 666},
            testObject: {class: TestObject, username: 'tester'},
            testInterval: {
                class: TestInterval,
                interval: 1000,
                mode: 'SEQ'
            },
            testCron: {
                class: TestCron,
                expression: '1,3,5,7,9,11,13,15,17,19,21,23,25,27,29,31,33,35,37,39,41,43,45,47,49,51,53,55,57,59 * * * * ? '
            },
            testThreadWork: {
                class: TestThreadTask
                // minThreads: 1,
                // maxThreads: 1
            }
            // '/Users/alex/WebstormProjects/core/src/tests/mds/**/*': {
            //  tester: 'this is tester'
            // }
        },
        autoload: [
            // '/Users/alex/WebstormProjects/core/src/tests/mds/**/*',
            MDSTest1
        ],
        components: {
            // access: {
            //     class: AccessControl,
            //     store: {type: 'file', filename: path.resolve(__dirname, 'test.csv')}
            // },
            access: {
                class: AccessControl,
                tableName: 'oh_access_control',
                store: {
                    type: 'mysql',
                    host: '192.168.0.145',
                    port: 3306,
                    username: 'root',
                    password: '20160329',
                    database: 'lakutata_test'
                }
                // store: {
                //     type: 'mongodb',
                //     host: '192.168.0.146',
                //     port: 27017,
                //     username: 'thinkraz',
                //     password: '20160329',
                //     authMechanism: 'SCRAM-SHA-1'
                // }
            },
            testComponent: {class: TestComponent, greet: 'hello world'}
        },
        modules: {
            tm: {class: TestModule1, greet: 'oh!'},
            tm1: TestModule1
        },
        controllers: [
            // '/Users/alex/WebstormProjects/core/src/tests/controllers/**/*',
            Test1Controller
        ],
        alias: {
            '@test': '@app/hh/jj'
        },
        bootstrap: [
            // 'testProc',
            // 'testThreadWork',
            'tm',
            'tm1',
            // 'testInterval',
            MDSTest1,
            async (app: Application) => {
                // fork(path.resolve('@app', 'TestProc'))
                // new Worker(path.resolve('@app', 'TestProc.js'))

                // console.log('============transpileModule==========')
                // let tstring=ts.transpileModule(fs.readFileSync(path.resolve('@app', 'TestProc.ts'),{encoding:'utf-8'}),{
                //     compilerOptions:{module:ts.ModuleKind.Node16}
                // }).outputText
                // tstring=`const require = await import('module').then(m=>m.createRequire(import.meta.url));${tstring}`
                // console.log(tstring)
                // new Worker(new URL(`data:text/javascript,${encodeURIComponent(tstring)}`),{})
                // console.log('============transpileModule==========')

                const formatter = await app.get<Formatter>('formatter')
                console.log(formatter.asPercent(1))
                console.log('app.mode():', app.mode())
                await app.set('mmm', {class: MDSTest1, tester: 'this is tester'})
                await app.set('testModel', {class: TestModel, greet: 'hello model'})
                const subScope = app.createScope()
                await subScope.get('testInterval')
                await subScope.get('testCron')
                const testModel = (await subScope.get<TestModel>('testModel'))
                testModel.on('property-changed', console.log)
                console.log('testModel.greet:', testModel.greet)
                testModel.aa = '6666668888888'
                const access = await app.get<AccessControl>('access', {user: {id: '20160329', username: 'testUser'}})
                await access.createRolePermission('user', '测试动作2', 'read')
                await access.createRolePermission('tester', '测试动作1', 'read')
                await access.assignRoleToUser('user')
                await access.assignRoleToUser('tester')
                console.log('access.listAllPermissions():', access.listAllPermissions(true))
                console.log('await access.listUserRoles():', await access.listUserRoles())
                // await access.createUserPermission('测试动作2','read')
                // await access.createUserPermission('测试动作1','read')
                console.log('await access.listUserPermission():', await access.listUserPermission())
                // await access.clearUserInfo()
                console.log(await app.dispatchToController({a: '2', b: '2'}, {
                    testBoolean: true,
                    user: {id: '20160329', username: 'testUser'}
                }))
                // console.log(await app.dispatchToController({test2:true}, {testBoolean: true}))
                const logger = await app.get<Logger>('log')
                logger.trace('more on this: %s', process.env.NODE_ENV)
                const testProc = await subScope.get<TestProcess>('testProc')
                testProc.on('test', (...args) => {
                    console.log('test event:', ...args)
                })
                testProc.emit('test', 'a', 'b', 1, 2, 3, 4, 5, 6)
                console.log('testProc.emitted')
                testProc.testProp = '666666'
                console.log('testProc.sayHi():', await testProc.sayHi(), testProc.testProp)
                const testThread = await subScope.get<TestThreadTask>('testThreadWork')
                const testThread1 = await subScope.get<TestThreadTask>('testThreadWork')
                console.log(await testThread.run('hahahahahah'))
                ConvertToStream('this is a test').pipe(testThread.createStreamHandler()).pipe(process.stdout)
                setTimeout(async () => {
                    await subScope.destroy()
                    // try {
                    //     const r = HttpRequest.get('http://jellyfin.cloud.thinkraz.com')
                    //     // const result=await r.stream()
                    //     console.log(await r.text())
                    //     setTimeout(() => {
                    //         r.abort()
                    //     }, 10000)
                    // } catch (e) {
                    //     console.log(e)
                    // }
                }, 3000)
            }
        ]
    })
    console.timeEnd('app')

    console.log(new Time('1968-01-01').add(1, 'day'))
    let time = new Time('1968-01-01')
    const time2 = new Time('1968-01-01')
    console.log(time2.timezone(), time2, time2.toISOString(), time2.toString(), time2.toTimeString(), time2.toDateString(), time2.toUTCString())
    time = time.timezone('Africa/Accra')
    console.log(time.timezone(), time, time.toISOString(), time.toString(), time.toTimeString(), time.toDateString(), time.toUTCString())


    // @ts-ignore
    // console.log(Module._cache)

    Logger.trace('more on this: %s', process.env.NODE_ENV)
    Logger.info('this is a logger test')

    // app.exit()
})()
