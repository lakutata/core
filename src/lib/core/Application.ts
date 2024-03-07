import {Module} from './Module.js'
import {Singleton} from '../../decorators/di/Lifetime.js'
import {Container} from './Container.js'
import {__destroy, __init} from '../base/BaseObject.js'
import {ApplicationConfigLoader} from '../base/internal/ApplicationConfigLoader.js'
import {ApplicationOptions} from '../../options/ApplicationOptions.js'
import {Inject} from '../../decorators/di/Inject.js'

@Singleton(true)
export class Application extends Module {

    protected ConfigLoader = ApplicationConfigLoader

    /**
     * Run application
     * @param options
     */
    public static async run(options: ApplicationOptions): Promise<void> {
        const rootContainer: Container = new Container()
        await rootContainer.set(Application, {
            options: options
        })
    }

    @Inject()
    protected app: Application

    /**
     * Internal initializer
     * @protected
     */
    protected async [__init](): Promise<void> {
        return super[__init](async (): Promise<void> => {
            //TODO
            // console.log(this)
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
    }

    /**
     * Destroyer
     * @protected
     */
    protected async destroy(): Promise<void> {
        return super.destroy()
    }

    /**
     * Get application's ID
     */
    public get appId(): string {
        return ''//TODO
    }

    /**
     * Get application's name
     */
    public get appName(): string {
        return ''//TODO
    }

    /**
     * Get application's timezone
     */
    public get timezone(): string {
        return ''//TODO
    }

    /**
     * Get application's uptime
     */
    public get uptime(): number {
        return 0//TODO
    }

    /**
     * Exit application
     * @param force
     */
    public exit(force?: boolean): void {
        //TODO
    }
}
