import {Module} from './Module.js'
import {Singleton} from '../../decorators/di/Lifetime.js'
import {Container} from './Container.js'
import {__destroy, __init} from '../base/BaseObject.js'
import {ApplicationConfigLoader} from '../base/internal/ApplicationConfigLoader.js'
import {ApplicationOptions} from '../../options/ApplicationOptions.js'
import {Alias} from '../Alias.js'
import {MODULE_INIT_DONE} from '../../constants/event-names/ModuleEventName.js'
import {GetBasicInfo} from '../base/internal/BasicInfo.js'

const RCTNR: symbol = Symbol('ROOT_CONTAINER')

@Singleton(true)
export class Application extends Module {

    /**
     * Override config loader
     * @protected
     */
    protected ConfigLoader = ApplicationConfigLoader

    /**
     * Application embed options
     * @protected
     */
    protected options: Partial<ApplicationOptions> = {
        //TODO 自带组件的声明
        alias: {
            '@runtime': process.cwd()
        }
    }

    /**
     * Run application
     * @param options
     */
    public static async run(options: ApplicationOptions): Promise<Application> {
        Alias.init()
        const rootContainer: Container = new Container()
        Reflect.defineMetadata(RCTNR, rootContainer, Application)
        return new Promise((resolve, reject): void => {
            ApplicationOptions
                .validateAsync(options)
                .then((applicationOptions: ApplicationOptions) => rootContainer
                    .set(Application, {options: applicationOptions})
                    .then((app: Application) => app.once(MODULE_INIT_DONE, () => resolve(app)))
                    .catch(reject)
                )
                .catch(reject)
        })
    }

    /**
     * Internal initializer
     * @protected
     */
    protected async [__init](): Promise<void> {
        return super[__init](async (): Promise<void> => {
            //TODO
        })
    }

    /**
     * Internal destroyer
     * @protected
     */
    protected async [__destroy](): Promise<void> {
        await super[__destroy]()
        //TODO
    }

    /**
     * Initializer
     * @protected
     */
    protected async init(): Promise<void> {
        //TODO
        console.log(await this.getObject('testModule'))
    }

    /**
     * Destroyer
     * @protected
     */
    protected async destroy(): Promise<void> {
        return super.destroy()
    }

    /**
     * Alias manager
     */
    public get alias(): Alias {
        return Alias.getAliasInstance()
    }

    /**
     * Get application's ID
     */
    public get appId(): string {
        return GetBasicInfo().appId
    }

    /**
     * Get application's name
     */
    public get appName(): string {
        return GetBasicInfo().appName
    }

    /**
     * Get application's timezone
     */
    public get timezone(): string {
        return GetBasicInfo().timezone
    }

    /**
     * Get application's uptime
     */
    public get uptime(): number {
        return Math.floor(process.uptime())
    }

    /**
     * Exit application
     * @param force
     */
    public exit(force?: boolean): void {
        const exit: () => void = () => process.exit(0)
        if (force) return exit()
        const rootContainer: Container = Reflect.getOwnMetadata(RCTNR, Application)
        rootContainer.destroy().then(exit).catch(exit)
    }
}
