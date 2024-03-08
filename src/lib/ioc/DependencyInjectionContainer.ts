import * as util from 'util'
import {
    DependencyInjectionRegistrationError,
    DependencyInjectionResolutionError,
    DependencyInjectionTypeError
} from './Errors.js'
import {InjectionMode, InjectionModeType} from './InjectionMode.js'
import {Lifetime, LifetimeType, isLifetimeLonger} from './Lifetime.js'
import {GlobWithOptions, listModules} from './ListModules.js'
import {importModule} from './LoadModuleNative.js'
import {
    LoadModulesOptions,
    LoadModulesResult,
    loadModules as realLoadModules
} from './LoadModules.js'
import {
    BuildResolverOptions,
    Constructor,
    DisposableResolver,
    Resolver,
    asClass,
    asFunction
} from './Resolvers.js'
import {isClass, last, nameValueToObject} from './Utils.js'
import {As} from '../base/functions/As.js'
import {
    DI_CONTAINER_NEW_TRANSIENT_CALLBACK
} from '../../constants/metadata-keys/DIMetadataKey.js'
import {GetObjectLifetime} from '../base/internal/ObjectLifetime.js'

/**
 * The container returned from createContainer has some methods and properties.
 * @interface IDependencyInjectionContainer
 */
export interface IDependencyInjectionContainer<Cradle extends object = any> {
    /**
     * Options the container was configured with.
     */
    options: ContainerOptions
    /**
     * The proxy injected when using `PROXY` injection mode.
     * Can be used as-is.
     */
    readonly cradle: Cradle
    /**
     * Getter for the rolled up registrations that merges the container family tree.
     */
    readonly registrations: RegistrationHash
    /**
     * Resolved modules cache.
     */
    readonly cache: Map<string | symbol, CacheEntry>

    /**
     * Creates a scoped container with this one as the parent.
     */
    createScope<T extends object = object>(): IDependencyInjectionContainer<Cradle & T>

    /**
     * Used by `util.inspect`.
     */
    inspect(depth: number, opts?: any): string

    /**
     * Binds `lib/loadModules` to this container, and provides
     * real implementations of its dependencies.
     *
     * Additionally, any modules using the `dependsOn` API
     * will be resolved.
     *
     * @see src/load-modules.ts documentation.
     */
    loadModules<ESM extends boolean = false>(
        globPatterns: Array<string | GlobWithOptions>,
        options?: LoadModulesOptions<ESM>
    ): ESM extends false ? this : Promise<this>

    /**
     * Adds a single registration that using a pre-constructed resolver.
     */
    register<T>(name: string | symbol, registration: Resolver<T>): this

    /**
     * Pairs resolvers to registration names and registers them.
     */
    register(nameAndRegistrationPair: NameAndRegistrationPair<Cradle>): this

    /**
     * Resolves the registration with the given name.
     *
     * @param  {string} name
     * The name of the registration to resolve.
     *
     * @return {*}
     * Whatever was resolved.
     */
    resolve<K extends keyof Cradle>(
        name: K,
        resolveOptions?: ResolveOptions
    ): Cradle[K]

    /**
     * Resolves the registration with the given name.
     *
     * @param  {string} name
     * The name of the registration to resolve.
     *
     * @return {*}
     * Whatever was resolved.
     */
    resolve<T>(name: string | symbol, resolveOptions?: ResolveOptions): T

    /**
     * Checks if the registration with the given name exists.
     *
     * @param {string | symbol} name
     * The name of the registration to resolve.
     *
     * @return {boolean}
     * Whether or not the registration exists.
     */
    hasRegistration(name: string | symbol): boolean

    /**
     * Recursively gets a registration by name if it exists in the
     * current container or any of its' parents.
     *
     * @param name {string | symbol} The registration name.
     */
    getRegistration<K extends keyof Cradle>(name: K): Resolver<Cradle[K]> | null

    /**
     * Recursively gets a registration by name if it exists in the
     * current container or any of its' parents.
     *
     * @param name {string | symbol} The registration name.
     */
    getRegistration<T = unknown>(name: string | symbol): Resolver<T> | null

    /**
     * Given a resolver, class or function, builds it up and returns it.
     * Does not cache it, this means that any lifetime configured in case of passing
     * a resolver will not be used.
     *
     * @param {Resolver|Class|Function} targetOrResolver
     * @param {ResolverOptions} opts
     */
    build<T>(
        targetOrResolver: ClassOrFunctionReturning<T> | Resolver<T>,
        opts?: BuildResolverOptions<T>
    ): T

    /**
     * Disposes this container and it's children, calling the disposer
     * on all disposable registrations and clearing the cache.
     * Only applies to registrations with `SCOPED` or `SINGLETON` lifetime.
     */
    dispose(): Promise<void>
}

/**
 * Optional resolve options.
 */
export interface ResolveOptions {
    /**
     * If `true` and `resolve` cannot find the requested dependency,
     * returns `undefined` rather than throwing an error.
     */
    allowUnregistered?: boolean
}

/**
 * Cache entry.
 */
export interface CacheEntry<T = any> {
    /**
     * The resolver that resolved the value.
     */
    resolver: Resolver<T>
    /**
     * The resolved value.
     */
    value: T
}

/**
 * Register a Registration
 * @interface NameAndRegistrationPair
 */
export type NameAndRegistrationPair<T> = {
    [U in keyof T]?: Resolver<T[U]>
}

/**
 * Function that returns T.
 */
export type FunctionReturning<T> = (...args: Array<any>) => T

/**
 * A class or function returning T.
 */
export type ClassOrFunctionReturning<T> = FunctionReturning<T> | Constructor<T>

/**
 * The options for the createContainer function.
 */
export interface ContainerOptions {
    require?: (id: string) => any
    injectionMode?: InjectionModeType
    strict?: boolean
}

/**
 * Contains a hash of registrations where the name is the key.
 */
export type RegistrationHash = Record<string | symbol | number, Resolver<any>>

export type ResolutionStack = Array<{
    name: string | symbol
    lifetime: LifetimeType
}>

/**
 * Family tree symbol.
 */
const FAMILY_TREE = Symbol('familyTree')

/**
 * Roll Up Registrations symbol.
 */
const ROLL_UP_REGISTRATIONS = Symbol('rollUpRegistrations')

/**
 * The string representation when calling toString.
 */
const CRADLE_STRING_TAG: string = 'DependencyInjectionContainerCradle'

/**
 * Creates an DI container instance.
 *
 * @param {Function} options.require The require function to use. Defaults to require.
 *
 * @param {string} options.injectionMode The mode used by the container to resolve dependencies.
 * Defaults to 'Proxy'.
 *
 * @param {boolean} options.strict True if the container should run in strict mode with additional
 * validation for resolver configuration correctness. Defaults to false.
 *
 * @return {IDependencyInjectionContainer<T>} The container.
 */
export function createContainer<T extends object = any>(
    options: ContainerOptions = {}
): IDependencyInjectionContainer<T> {
    return createContainerInternal(options)
}

function createContainerInternal<
    T extends object = any,
    U extends object = any,
>(
    options: ContainerOptions,
    parentContainer?: IDependencyInjectionContainer<U>,
    parentResolutionStack?: ResolutionStack
): IDependencyInjectionContainer<T> {
    options = {
        injectionMode: InjectionMode.PROXY,
        strict: false,
        ...options
    }

    /**
     * Tracks the names and lifetimes of the modules being resolved. Used to detect circular
     * dependencies and, in strict mode, lifetime leakage issues.
     */
    const resolutionStack: ResolutionStack = parentResolutionStack ?? []

    // Internal registration store for this container.
    const registrations: RegistrationHash = {}

    /**
     * The `Proxy` that is passed to functions so they can resolve their dependencies without
     * knowing where they come from. I call it the "cradle" because
     * it is where registered things come to life at resolution-time.
     */
    const cradle = new Proxy(
        {
            [util.inspect.custom]: toStringRepresentationFn
        },
        {
            /**
             * The `get` handler is invoked whenever a get-call for `container.cradle.*` is made.
             *
             * @param  {object} _target
             * The proxy target. Irrelevant.
             *
             * @param  {string} name
             * The property name.
             *
             * @return {*}
             * Whatever the resolve call returns.
             */
            get: (_target: object, name: string): any => resolve(name),

            /**
             * Setting things on the cradle throws an error.
             *
             * @param  {object} target
             * @param  {string} name
             */
            set: (_target, name: string) => {
                throw new Error(
                    `Attempted setting property "${
                        name as any
                    }" on container cradle - this is not allowed.`
                )
            },

            /**
             * Used for `Object.keys`.
             */
            ownKeys() {
                return Array.from(cradle as any)
            },

            /**
             * Used for `Object.keys`.
             */
            getOwnPropertyDescriptor(target, key) {
                const regs = rollUpRegistrations()
                if (Object.getOwnPropertyDescriptor(regs, key)) {
                    return {
                        enumerable: true,
                        configurable: true
                    }
                }

                return undefined
            }
        }
    ) as T

    // The container being exposed.
    const container = {
        options,
        cradle,
        inspect,
        cache: new Map<string | symbol, CacheEntry>(),
        loadModules,
        createScope,
        register: register as any,
        build,
        resolve,
        hasRegistration,
        dispose,
        getRegistration,
        [util.inspect.custom]: inspect,
        // tslint:disable-next-line
        [ROLL_UP_REGISTRATIONS!]: rollUpRegistrations,
        get registrations() {
            return rollUpRegistrations()
        }
    }

    // Track the family tree.
    const familyTree: Array<IDependencyInjectionContainer> = parentContainer
            ? [container].concat(As(parentContainer)[FAMILY_TREE])
            : [container]

        // Save it so we can access it from a scoped container.
    ;(container as any)[FAMILY_TREE] = familyTree

    // We need a reference to the root container,
    // so we can retrieve and store singletons.
    const rootContainer = last(familyTree)

    return container

    /**
     * Used by util.inspect (which is used by console.log).
     */
    function inspect(): string {
        return `[DependencyInjectionContainer (${
            parentContainer ? 'scoped, ' : ''
        }registrations: ${Object.keys(container.registrations).length})]`
    }

    /**
     * Rolls up registrations from the family tree.
     *
     * This can get pretty expensive. Only used when
     * iterating the cradle proxy, which is not something
     * that should be done in day-to-day use, mostly for debugging.
     *
     * Forces a recomputation.
     *
     * @return {object}
     * The merged registrations object.
     */
    function rollUpRegistrations(): RegistrationHash {
        return {
            ...(parentContainer && (parentContainer as any)[ROLL_UP_REGISTRATIONS]()),
            ...registrations
        }
    }

    /**
     * Used for providing an iterator to the cradle.
     */
    function* cradleIterator() {
        const registrations = rollUpRegistrations()
        for (const registrationName in registrations) {
            yield registrationName
        }
    }

    /**
     * Creates a scoped container.
     *
     * @return {object}
     * The scoped container.
     */
    function createScope<P extends object>(): IDependencyInjectionContainer<P & T> {
        return createContainerInternal(
            options,
            container as IDependencyInjectionContainer<T>,
            resolutionStack
        )
    }

    /**
     * Adds a registration for a resolver.
     */
    function register(arg1: any, arg2: any): IDependencyInjectionContainer<T> {
        const obj = nameValueToObject(arg1, arg2)
        const keys = [...Object.keys(obj), ...Object.getOwnPropertySymbols(obj)]

        for (const key of keys) {
            const resolver = obj[key as any] as Resolver<any>
            // If strict mode is enabled, check to ensure we are not registering a singleton on a non-root
            // container.
            if (options.strict && resolver.lifetime === Lifetime.SINGLETON) {
                if (parentContainer) {
                    throw new DependencyInjectionRegistrationError(
                        key,
                        'Cannot register a singleton on a scoped container.'
                    )
                }
            }

            registrations[key as any] = resolver
        }

        return container
    }

    /**
     * Returned to `util.inspect` and Symbol.toStringTag when attempting to resolve
     * a custom inspector function on the cradle.
     */
    function toStringRepresentationFn() {
        return Object.prototype.toString.call(cradle)
    }

    /**
     * Recursively gets a registration by name if it exists in the
     * current container or any of its' parents.
     *
     * @param name {string | symbol} The registration name.
     */
    function getRegistration(name: string | symbol) {
        const resolver = registrations[name]
        if (resolver) {
            return resolver
        }

        if (parentContainer) {
            return parentContainer.getRegistration(name)
        }

        return null
    }

    /**
     * Resolves the registration with the given name.
     * @param name
     * @param resolveOpts
     */
    function resolve(this: any, name: string | symbol, resolveOpts?: ResolveOptions): any {
        resolveOpts = resolveOpts || {}

        try {
            // Grab the registration by name.
            const resolver = getRegistration(name)
            if (resolutionStack.some(({name: parentName}) => parentName === name)) {
                throw new DependencyInjectionResolutionError(
                    name,
                    resolutionStack,
                    'Cyclic dependencies detected.'
                )
            }

            // Used in JSON.stringify.
            if (name === 'toJSON') {
                return toStringRepresentationFn
            }

            // Used in console.log.
            if (name === 'constructor') {
                return createContainer
            }

            if (!resolver) {
                // Checks for some edge cases.
                switch (name) {
                    // The following checks ensure that console.log on the cradle does not
                    // throw an error (issue #7).
                    case util.inspect.custom:
                    case 'inspect':
                    case 'toString':
                        return toStringRepresentationFn
                    case Symbol.toStringTag:
                        return CRADLE_STRING_TAG
                    // Edge case: Promise unwrapping will look for a "then" property and attempt to call it.
                    // Return undefined so that we won't cause a resolution error. (issue #109)
                    case 'then':
                        return undefined
                    // When using `Array.from` or spreading the cradle, this will
                    // return the registration names.
                    case Symbol.iterator:
                        return cradleIterator
                }

                if (resolveOpts.allowUnregistered) {
                    return undefined
                }

                throw new DependencyInjectionResolutionError(name, resolutionStack)
            }

            const lifetime = resolver.lifetime || Lifetime.TRANSIENT

            // if we are running in strict mode, this resolver is not explicitly marked leak-safe, and any
            // of the parents have a shorter lifetime than the one requested, throw an error.
            if (options.strict && !resolver.isLeakSafe) {
                const maybeLongerLifetimeParentIndex = resolutionStack.findIndex(
                    ({lifetime: parentLifetime}) =>
                        isLifetimeLonger(parentLifetime, lifetime)
                )
                if (maybeLongerLifetimeParentIndex > -1) {
                    throw new DependencyInjectionResolutionError(
                        name,
                        resolutionStack,
                        `Dependency '${name.toString()}' has a shorter lifetime than its ancestor: '${resolutionStack[
                            maybeLongerLifetimeParentIndex
                            ].name.toString()}'`
                    )
                }
            }

            // Pushes the currently-resolving module information onto the stack
            resolutionStack.push({name, lifetime})

            // Do the thing
            let cached: CacheEntry | undefined
            let resolved: any
            switch (lifetime) {
                case Lifetime.TRANSIENT:
                    // Transient lifetime means resolve every time.
                    resolved = resolver.resolve(container)
                    break
                case Lifetime.SINGLETON:
                    // Singleton lifetime means cache at all times, regardless of scope.
                    cached = rootContainer.cache.get(name)
                    if (!cached) {
                        // if we are running in strict mode, perform singleton resolution using the root
                        // container only.
                        resolved = resolver.resolve(
                            options.strict ? rootContainer : container
                        )
                        rootContainer.cache.set(name, {resolver, value: resolved})
                    } else {
                        resolved = cached.value
                    }
                    break
                case Lifetime.SCOPED:
                    // Scoped lifetime means that the container
                    // that resolves the registration also caches it.
                    // If this container cache does not have it,
                    // resolve and cache it rather than using the parent
                    // container's cache.
                    cached = container.cache.get(name)
                    if (cached !== undefined) {
                        // We found one!
                        resolved = cached.value
                        break
                    }

                    // If we still have not found one, we need to resolve and cache it.
                    resolved = resolver.resolve(container)
                    container.cache.set(name, {resolver, value: resolved})
                    break
                default:
                    throw new DependencyInjectionResolutionError(
                        name,
                        resolutionStack,
                        `Unknown lifetime "${resolver.lifetime}"`
                    )
            }
            // Pop it from the stack again, ready for the next resolution
            resolutionStack.pop()
            /**
             * 用于加载配置对象至注入项目内
             */
            //判断是否为瞬态模式的注册项目调用，若为瞬态模式的注册项目调用，则应找个地方记录下来，以便在容器销毁时对残留的瞬态对象实例销毁
            if (GetObjectLifetime(resolved.constructor) === Lifetime.TRANSIENT) {
                const diContainer: IDependencyInjectionContainer = this
                diContainer[DI_CONTAINER_NEW_TRANSIENT_CALLBACK](new WeakRef(resolved))
            }
            return resolved
        } catch (err) {
            // When we get an error we need to reset the stack. Mutate the existing array rather than
            // updating the reference to ensure all parent containers' stacks are also updated.
            resolutionStack.length = 0
            throw err
        }
    }

    /**
     * Checks if the registration with the given name exists.
     * @param name
     */
    function hasRegistration(name: string | symbol): boolean {
        return !!getRegistration(name)
    }

    /**
     * Given a registration, class or function, builds it up and returns it.
     * Does not cache it, this means that any lifetime configured in case of passing
     * a registration will not be used.
     * @param targetOrResolver
     * @param opts
     */
    function build<T>(
        targetOrResolver: Resolver<T> | ClassOrFunctionReturning<T>,
        opts?: BuildResolverOptions<T>
    ): T {
        if (targetOrResolver && (targetOrResolver as Resolver<T>).resolve) {
            return (targetOrResolver as Resolver<T>).resolve(container)
        }

        const funcName = 'build'
        const paramName = 'targetOrResolver'
        DependencyInjectionTypeError.assert(
            targetOrResolver,
            funcName,
            paramName,
            'a registration, function or class',
            targetOrResolver
        )
        DependencyInjectionTypeError.assert(
            typeof targetOrResolver === 'function',
            funcName,
            paramName,
            'a function or class',
            targetOrResolver
        )

        const resolver = isClass(targetOrResolver as any)
            ? asClass(targetOrResolver as Constructor<T>, opts)
            : asFunction(targetOrResolver as FunctionReturning<T>, opts)
        return resolver.resolve(container)
    }

    function loadModules<ESM extends boolean = false>(
        globPatterns: Array<string | GlobWithOptions>,
        opts: LoadModulesOptions<ESM>
    ): ESM extends false ? IDependencyInjectionContainer : Promise<IDependencyInjectionContainer>
    /**
     * Binds `lib/loadModules` to this container, and provides
     * real implementations of its dependencies.
     *
     * Additionally, any modules using the `dependsOn` API
     * will be resolved.
     *
     * @see lib/loadModules.js documentation.
     */
    function loadModules<ESM extends boolean = false>(
        globPatterns: Array<string | GlobWithOptions>,
        opts: LoadModulesOptions<ESM>
    ): Promise<IDependencyInjectionContainer> | IDependencyInjectionContainer {
        const _loadModulesDeps = {
            require:
                options!.require ||
                function (uri) {
                    return require(uri)
                },
            listModules,
            container
        }
        if (opts?.esModules) {
            _loadModulesDeps.require = importModule
            return (
                realLoadModules(
                    _loadModulesDeps,
                    globPatterns,
                    opts
                ) as Promise<LoadModulesResult>
            ).then(() => container)
        } else {
            realLoadModules(_loadModulesDeps, globPatterns, opts)
            return container
        }
    }

    /**
     * Disposes this container and it's children, calling the disposer
     * on all disposable registrations and clearing the cache.
     */
    async function dispose(): Promise<void> {
        const entries = Array.from(container.cache.entries())
        container.cache.clear()
        return Promise.all(
            entries.map(async ([, entry]): Promise<any> => {
                const {resolver, value} = entry
                const disposable = resolver as DisposableResolver<any>
                if (disposable.dispose) {
                    await Promise.resolve()
                    return disposable.dispose!(value)
                }
                return Promise.resolve()
            })
        ).then(() => undefined)
    }
}
