
declare module "meteor/mongoExt" {
    
    /** From https://medium.com/@flut1/deep-flatten-typescript-types-with-finite-recursion-cb79233d93ca */
    type NonObjectKeysOf<T> = {
        [K in keyof T]: T[K] extends Array<any> ? K : T[K] extends object ? never : K
    }[keyof T];

    type ValuesOf<T> = T[keyof T];
    type ObjectValuesOf<T extends Object> = Exclude<Exclude<Extract<ValuesOf<T>, object>, never>, Array<any>>;
    type UnionToIntersection<U> = (U extends any
        ? (k: U) => void
        : never) extends ((k: infer I) => void)
        ? I
        : never;
    type Flatten<T> = Pick<T, NonObjectKeysOf<T>> & UnionToIntersection<ObjectValuesOf<T>>;


    type FieldExpression<T> = {
        $eq?: T,
        $gt?: T,
        $gte?: T,
        $lt?: T,
        $lte?: T,
        $in?: T[],
        $nin?: T[],
        $ne?: T,
        $exists?: boolean,
        // $type?: BsonType[] | BsonType,
        $not?: FieldExpression<T>,
        // $expr?: FieldExpression<T>,
        // $jsonSchema?: any,
        // $mod?: number[],
        // $regex?: RegExp | string,
        // $options?: string,
        // $text?: { $search: string, $language?: string, $caseSensitive?: boolean, $diacriticSensitive?: boolean },
        // $where?: string | Function,
        // $geoIntersects?: any,
        // $geoWithin?: any,
        // $near?: any,
        // $nearSphere?: any,
        // $all?: T[],
        // $elemMatch?: T extends {} ? Query<T> : FieldExpression<T>,
        // $size?: number,
        // $bitsAllClear?: any,
        // $bitsAllSet?: any,
        // $bitsAnyClear?: any,
        // $bitsAnySet?: any,
        // $comment?: string
    }

    type UnArray<T> = T extends any[] ? T[0] : T

    type Query<T> = {
        [P in keyof T]?: MongoQuery<T[P]>
    } & {
        $or?: Query<T>[],
        $and?: Query<T>[],
        $nor?: Query<T>[]
    } // & Dictionary<any>

    // type Selector<T> = Query<T> | QueryWithModifiers<T>

    interface ProtectedString<T> {
        _protectedType: T
    }

    type PrimitiveTypes = string | number | boolean | ProtectedString<any> | null

    type MongoQuery<T> = UnArray<T> | RegExp | FieldExpression<UnArray<T>>
    type DeepMongoQuery2<T, T2 extends string> = T extends PrimitiveTypes ? { [T2]: T } : ({
        [K in keyof T as `${T2}.${K}`]: T[K]
    } & Flatten<{
        [K in keyof T]: DeepMongoQuery2<T[K], `${T2}.${K}`>
    }>)
    type DeepMongoQuery<T> =  T extends PrimitiveTypes ? T : ({
        [K in keyof T]: T[K]
    } & Flatten<{
        [K in keyof T]: DeepMongoQuery2<T[K], K>
    }>)

    type DeepQuery<T> = Query<DeepMongoQuery<T>>
}