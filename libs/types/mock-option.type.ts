type NestedKeyOf<ObjectType extends object> = {
    [Key in keyof ObjectType & (string | number)]: ObjectType[Key] extends object
        ? `${Key}` | `${Key}.${NestedKeyOf<ObjectType[Key]>}`
        : `${Key}`;
}[keyof ObjectType & (string | number)];

export type MockMethodType = `faker.${NestedKeyOf<Faker.FakerStatic>}`;

export type MockOptionType = {
    method?: MockMethodType;
    args?: any[];
    sample?: any;
    nestedMaxSize?: number;
};
