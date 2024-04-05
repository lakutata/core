import {Exception} from '../../../lib/base/abstracts/Exception.js'

export class DockerImageImportException extends Exception {
    public errno: string | number = 'E_DOCKER_IMAGE_IMPORT'
}