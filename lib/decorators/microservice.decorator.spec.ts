/* eslint-disable max-lines-per-function */
/* eslint-disable @typescript-eslint/no-unsafe-function-type */
import 'reflect-metadata';
import { GrpcAction, RegisterGrpcMicroservice } from './microservice.decorator';
import { GrpcValue } from './grpc-value.decorator';
import { GrpcId } from './grpc-param.decorator';
import { GrpcMetadataId } from './grpc-metadata.decorator';
import { Property } from './property.decorator';
import { microserviceStorage } from '../storages/microservice.storage';
import { propertyStorage, sdkDtos } from '../storages/property.storage';
import {
    DIRECT_PARAMETERS_METADATA_KEY,
    GRPC_DESCRIPTION_METADATA_KEY,
    GRPC_METHOD_METADATA_KEY,
    GRPC_PARAM_INDEX_METADATA_KEY
} from '../constants/metadata-key.const';
import { PropertyType } from '../types/property-option.type';

const workspaceUuid = '550e8400-e29b-41d4-a716-446655440000';

describe('Microservice decorators', () => {
    let savedMicroservices: Function[];
    let savedProperties: Array<[Function, PropertyType[]]>;
    let savedSdkDtos: Function[];

    beforeEach(() => {
        savedMicroservices = [...microserviceStorage];
        savedProperties = Array.from(propertyStorage.entries());
        savedSdkDtos = Array.from(sdkDtos);
    });

    afterEach(() => {
        microserviceStorage.length = 0;
        microserviceStorage.push(...savedMicroservices);
        propertyStorage.clear();
        for (const [key, value] of savedProperties) {
            propertyStorage.set(key, value);
        }
        sdkDtos.clear();
        for (const dto of savedSdkDtos) {
            sdkDtos.add(dto);
        }
    });

    describe('RegisterGrpcMicroservice', () => {
        it('pushes the class into the microservice storage', () => {
            @RegisterGrpcMicroservice()
            class UserMicroservice {}

            expect(microserviceStorage).toContain(UserMicroservice);
        });

        it('stores the description as metadata on the class', () => {
            @RegisterGrpcMicroservice('User management microservice')
            class UserMicroservice {}

            expect(Reflect.getMetadata(GRPC_DESCRIPTION_METADATA_KEY, UserMicroservice)).toBe(
                'User management microservice'
            );
        });

        it('stores undefined as description when none is given', () => {
            @RegisterGrpcMicroservice()
            class UserMicroservice {}

            expect(Reflect.getMetadataKeys(UserMicroservice)).toContain(GRPC_DESCRIPTION_METADATA_KEY);
            expect(Reflect.getMetadata(GRPC_DESCRIPTION_METADATA_KEY, UserMicroservice)).toBeUndefined();
        });

        it('registers classes in declaration order', () => {
            @RegisterGrpcMicroservice()
            class FirstMicroservice {}

            @RegisterGrpcMicroservice()
            class SecondMicroservice {}

            const firstIndex = microserviceStorage.indexOf(FirstMicroservice);
            const secondIndex = microserviceStorage.indexOf(SecondMicroservice);
            expect(firstIndex).toBeGreaterThanOrEqual(0);
            expect(secondIndex).toBe(firstIndex + 1);
        });
    });

    describe('GrpcAction', () => {
        it('marks the method as a grpc method with its description', () => {
            class BodyDto {
                @Property({ type: String })
                name: string;
            }

            class UserService {
                @GrpcAction('Find one user')
                findOne(@GrpcValue() param: BodyDto): BodyDto {
                    return param;
                }
            }

            expect(Reflect.getMetadata(GRPC_METHOD_METADATA_KEY, UserService.prototype, 'findOne')).toBe(true);
            expect(Reflect.getMetadata(GRPC_DESCRIPTION_METADATA_KEY, UserService.prototype, 'findOne')).toBe(
                'Find one user'
            );
        });

        it('registers the nest grpc method pattern using the class and method names', () => {
            class UserService {
                @GrpcAction()
                findOne(@GrpcValue() param: object): object {
                    return param;
                }
            }

            const pattern = Reflect.getMetadata('microservices:pattern', UserService.prototype.findOne);
            expect(JSON.stringify(pattern)).toContain('"service":"UserService"');
            expect(JSON.stringify(pattern)).toContain('"rpc":"findOne"');
        });

        it('does not wrap methods that only use @GrpcValue', () => {
            class UserService {
                @GrpcAction()
                echo(@GrpcValue() param: object): object {
                    return param;
                }
            }

            const instance = new UserService();
            const body = { name: 'test' };
            expect(instance.echo(body)).toBe(body);
            expect(Reflect.getMetadata(GRPC_PARAM_INDEX_METADATA_KEY, UserService.prototype, 'echo')).toBe(0);
        });

        describe('with direct parameters', () => {
            it('maps the request body fields to positional arguments', () => {
                class UserService {
                    @GrpcAction()
                    getUser(@GrpcId('userId') userId: string): string {
                        return `user:${userId}`;
                    }
                }

                const instance = new UserService();
                expect((instance.getUser as any)({ userId: 'abc' })).toBe('user:abc');
            });

            it('passes trailing arguments such as metadata through to the original method', () => {
                const received: any[] = [];

                class UserService {
                    @GrpcAction()
                    getUser(@GrpcId('userId') userId: string): string {
                        // eslint-disable-next-line prefer-rest-params
                        received.push(...Array.from(arguments));
                        return userId;
                    }
                }

                const fakeMetadata = { get: () => [] };
                (new UserService().getUser as any)({ userId: 'abc' }, fakeMetadata, 'call-ref');
                expect(received).toEqual(['abc', fakeMetadata, 'call-ref']);
            });

            it('combines @GrpcValue body with direct parameters under the "body" key', () => {
                class PayloadDto {
                    @Property({ type: String })
                    address: string;
                }

                class UserService {
                    @GrpcAction()
                    resolve(@GrpcValue() payload: PayloadDto, @GrpcId('ownerId') ownerId: string): any {
                        return { payload, ownerId };
                    }
                }

                const payload = { address: 'somewhere' };
                const result = (new UserService().resolve as any)({ body: payload, ownerId: 'owner-1' });
                expect(result).toEqual({ payload, ownerId: 'owner-1' });
            });

            it('generates a params dto, registers it and rewrites design:paramtypes', () => {
                class UserService {
                    @GrpcAction()
                    getUser(@GrpcId('userId') userId: string): string {
                        return userId;
                    }
                }

                const paramTypes = Reflect.getMetadata('design:paramtypes', UserService.prototype, 'getUser');
                const generatedDto = paramTypes[0];
                expect(generatedDto.name).toBe('UserServiceGetUserParams');
                expect(propertyStorage.get(generatedDto)).toEqual([
                    { name: 'userId', option: expect.objectContaining({ type: 'string', required: true }) }
                ]);
                expect(Reflect.getMetadata(GRPC_PARAM_INDEX_METADATA_KEY, UserService.prototype, 'getUser')).toBe(0);
            });

            it('keeps the direct parameters metadata sorted with the synthetic body parameter', () => {
                class PayloadDto {
                    @Property({ type: String })
                    address: string;
                }

                class UserService {
                    @GrpcAction()
                    resolve(@GrpcValue() payload: PayloadDto, @GrpcId('ownerId') ownerId: string): any {
                        return { payload, ownerId };
                    }
                }

                const params = Reflect.getMetadata(DIRECT_PARAMETERS_METADATA_KEY, UserService.prototype, 'resolve');
                expect(params.map((param: any) => ({ name: param.name, index: param.index }))).toEqual([
                    { name: 'body', index: 0 },
                    { name: 'ownerId', index: 1 }
                ]);
                expect(params[0].type).toBe(PayloadDto);
            });

            it('throws when the decorated parameters are not continuous from index 0', () => {
                expect(() => {
                    class BrokenService {
                        @GrpcAction()
                        getUser(first: string, @GrpcId('userId') userId: string): string {
                            return `${first}:${userId}`;
                        }
                    }

                    return BrokenService;
                }).toThrow('Grpc direct parameters must be continuous and start from index 0 in method getUser');
            });
        });

        describe('with metadata parameters', () => {
            function createMetadata(key: string, value: string) {
                return { get: (name: string) => (name === key ? [value] : []) };
            }

            it('resolves metadata parameters from the grpc metadata argument', () => {
                class WorkspaceService {
                    @GrpcAction()
                    getWorkspaceId(@GrpcMetadataId('workspace-id') workspaceId: string): string {
                        return `ws:${workspaceId}`;
                    }
                }

                const metadata = createMetadata('workspace-id', workspaceUuid);
                const result = (new WorkspaceService().getWorkspaceId as any)({}, metadata, 'call-ref');
                expect(result).toBe(`ws:${workspaceUuid}`);
            });

            it('passes the body and metadata parameters together to the original method', () => {
                const received: any[] = [];

                class WorkspaceService {
                    @GrpcAction()
                    list(@GrpcValue() param: object, @GrpcMetadataId('workspace-id') workspaceId: string): string {
                        received.push(param, workspaceId);
                        return workspaceId;
                    }
                }

                const body = { keyword: 'test' };
                const metadata = createMetadata('workspace-id', workspaceUuid);
                (new WorkspaceService().list as any)(body, metadata, 'call-ref');
                expect(received).toEqual([body, workspaceUuid]);
            });

            it('throws when a metadata parameter fails validation', () => {
                class WorkspaceService {
                    @GrpcAction()
                    getWorkspaceId(@GrpcMetadataId('workspace-id') workspaceId: string): string {
                        return workspaceId;
                    }
                }

                const metadata = createMetadata('workspace-id', 'not-a-uuid');
                expect(() => (new WorkspaceService().getWorkspaceId as any)({}, metadata, 'call-ref')).toThrow(
                    /Validation failed for metadata parameter .* "workspace-id"/
                );
            });
        });
    });
});
