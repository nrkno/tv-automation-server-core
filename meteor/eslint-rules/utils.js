"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
exports.__esModule = true;
exports.scopeHasLocalReference = exports.isDescribeCall = exports.isTestCaseCall = exports.getTestCallExpressionsFromDeclaredVariables = exports.isHook = exports.isFunction = exports.getNodeName = exports.TestCaseProperty = exports.DescribeProperty = exports.HookName = exports.TestCaseName = exports.DescribeAlias = exports.parseExpectCall = exports.isParsedEqualityMatcherCall = exports.EqualityMatcher = exports.ModifierName = exports.isExpectMember = exports.isExpectCall = exports.getAccessorValue = exports.isSupportedAccessor = exports.hasOnlyOneArgument = exports.getStringValue = exports.isStringNode = exports.followTypeAssertionChain = exports.createRule = void 0;
/** https://github.com/jest-community/eslint-plugin-jest/blob/96031ecaab22a6550be0c9fc62fe96eec6bb0fff/src/rules/utils.ts */
var path_1 = require("path");
var experimental_utils_1 = require("@typescript-eslint/experimental-utils");
var package_json_1 = require("../../package.json");
var REPO_URL = 'https://github.com/jest-community/eslint-plugin-jest';
exports.createRule = experimental_utils_1.ESLintUtils.RuleCreator(function (name) {
    var ruleName = path_1.parse(name).name;
    return REPO_URL + "/blob/v" + package_json_1.version + "/docs/rules/" + ruleName + ".md";
});
var isTypeCastExpression = function (node) {
    return node.type === experimental_utils_1.AST_NODE_TYPES.TSAsExpression ||
        node.type === experimental_utils_1.AST_NODE_TYPES.TSTypeAssertion;
};
var followTypeAssertionChain = function (expression) {
    return isTypeCastExpression(expression)
        ? exports.followTypeAssertionChain(expression.expression)
        : expression;
};
exports.followTypeAssertionChain = followTypeAssertionChain;
/**
 * Checks if the given `node` is a `StringLiteral`.
 *
 * If a `value` is provided & the `node` is a `StringLiteral`,
 * the `value` will be compared to that of the `StringLiteral`.
 *
 * @param {Node} node
 * @param {V} [value]
 *
 * @return {node is StringLiteral<V>}
 *
 * @template V
 */
var isStringLiteral = function (node, value) {
    return node.type === experimental_utils_1.AST_NODE_TYPES.Literal &&
        typeof node.value === 'string' &&
        (value === undefined || node.value === value);
};
/**
 * Checks if the given `node` is a `TemplateLiteral`.
 *
 * Complex `TemplateLiteral`s are not considered specific, and so will return `false`.
 *
 * If a `value` is provided & the `node` is a `TemplateLiteral`,
 * the `value` will be compared to that of the `TemplateLiteral`.
 *
 * @param {Node} node
 * @param {V} [value]
 *
 * @return {node is TemplateLiteral<V>}
 *
 * @template V
 */
var isTemplateLiteral = function (node, value) {
    return node.type === experimental_utils_1.AST_NODE_TYPES.TemplateLiteral &&
        node.quasis.length === 1 && // bail out if not simple
        (value === undefined || node.quasis[0].value.raw === value);
};
/**
 * Checks if the given `node` is a {@link StringNode}.
 *
 * @param {Node} node
 * @param {V} [specifics]
 *
 * @return {node is StringNode}
 *
 * @template V
 */
var isStringNode = function (node, specifics) {
    return isStringLiteral(node, specifics) || isTemplateLiteral(node, specifics);
};
exports.isStringNode = isStringNode;
/**
 * Gets the value of the given `StringNode`.
 *
 * If the `node` is a `TemplateLiteral`, the `raw` value is used;
 * otherwise, `value` is returned instead.
 *
 * @param {StringNode<S>} node
 *
 * @return {S}
 *
 * @template S
 */
var getStringValue = function (node) {
    return isTemplateLiteral(node) ? node.quasis[0].value.raw : node.value;
};
exports.getStringValue = getStringValue;
/**
 * Guards that the given `call` has only one `argument`.
 *
 * @param {CallExpression} call
 *
 * @return {call is CallExpressionWithSingleArgument}
 */
var hasOnlyOneArgument = function (call) { return call.arguments.length === 1; };
exports.hasOnlyOneArgument = hasOnlyOneArgument;
/**
 * Checks if the given `node` is an `Identifier`.
 *
 * If a `name` is provided, & the `node` is an `Identifier`,
 * the `name` will be compared to that of the `identifier`.
 *
 * @param {Node} node
 * @param {V} [name]
 *
 * @return {node is KnownIdentifier<Name>}
 *
 * @template V
 */
var isIdentifier = function (node, name) {
    return node.type === experimental_utils_1.AST_NODE_TYPES.Identifier &&
        (name === undefined || node.name === name);
};
/**
 * Checks if the given `node` is a "supported accessor".
 *
 * This means that it's a node can be used to access properties,
 * and who's "value" can be statically determined.
 *
 * `MemberExpression` nodes most commonly contain accessors,
 * but it's possible for other nodes to contain them.
 *
 * If a `value` is provided & the `node` is an `AccessorNode`,
 * the `value` will be compared to that of the `AccessorNode`.
 *
 * Note that `value` here refers to the normalised value.
 * The property that holds the value is not always called `name`.
 *
 * @param {Node} node
 * @param {V} [value]
 *
 * @return {node is AccessorNode<V>}
 *
 * @template V
 */
var isSupportedAccessor = function (node, value) {
    return isIdentifier(node, value) || exports.isStringNode(node, value);
};
exports.isSupportedAccessor = isSupportedAccessor;
/**
 * Gets the value of the given `AccessorNode`,
 * account for the different node types.
 *
 * @param {AccessorNode<S>} accessor
 *
 * @return {S}
 *
 * @template S
 */
var getAccessorValue = function (accessor) {
    return accessor.type === experimental_utils_1.AST_NODE_TYPES.Identifier
        ? accessor.name
        : exports.getStringValue(accessor);
};
exports.getAccessorValue = getAccessorValue;
/**
 * Checks if the given `node` is a valid `ExpectCall`.
 *
 * In order to be an `ExpectCall`, the `node` must:
 *  * be a `CallExpression`,
 *  * have an accessor named 'expect',
 *  * have a `parent`.
 *
 * @param {Node} node
 *
 * @return {node is ExpectCall}
 */
var isExpectCall = function (node) {
    return node.type === experimental_utils_1.AST_NODE_TYPES.CallExpression &&
        exports.isSupportedAccessor(node.callee, 'expect') &&
        node.parent !== undefined;
};
exports.isExpectCall = isExpectCall;
var isExpectMember = function (node, name) {
    return node.type === experimental_utils_1.AST_NODE_TYPES.MemberExpression &&
        exports.isSupportedAccessor(node.property, name);
};
exports.isExpectMember = isExpectMember;
var ModifierName;
(function (ModifierName) {
    ModifierName["not"] = "not";
    ModifierName["rejects"] = "rejects";
    ModifierName["resolves"] = "resolves";
})(ModifierName = exports.ModifierName || (exports.ModifierName = {}));
var EqualityMatcher;
(function (EqualityMatcher) {
    EqualityMatcher["toBe"] = "toBe";
    EqualityMatcher["toEqual"] = "toEqual";
    EqualityMatcher["toStrictEqual"] = "toStrictEqual";
})(EqualityMatcher = exports.EqualityMatcher || (exports.EqualityMatcher = {}));
var isParsedEqualityMatcherCall = function (matcher, name) {
    return (name
        ? matcher.name === name
        : EqualityMatcher.hasOwnProperty(matcher.name)) &&
        matcher.arguments !== null &&
        matcher.arguments.length === 1;
};
exports.isParsedEqualityMatcherCall = isParsedEqualityMatcherCall;
var parseExpectMember = function (expectMember) { return ({
    name: exports.getAccessorValue(expectMember.property),
    node: expectMember
}); };
var reparseAsMatcher = function (parsedMember) { return (__assign(__assign({}, parsedMember), { 
    /**
     * The arguments being passed to this `Matcher`, if any.
     *
     * If this matcher isn't called, this will be `null`.
     */
    arguments: parsedMember.node.parent &&
        parsedMember.node.parent.type === experimental_utils_1.AST_NODE_TYPES.CallExpression
        ? parsedMember.node.parent.arguments
        : null })); };
/**
 * Re-parses the given `parsedMember` as a `ParsedExpectModifier`.
 *
 * If the given `parsedMember` does not have a `name` of a valid `Modifier`,
 * an exception will be thrown.
 *
 * @param {ParsedExpectMember<ModifierName>} parsedMember
 *
 * @return {ParsedExpectModifier}
 */
var reparseMemberAsModifier = function (parsedMember) {
    if (isSpecificMember(parsedMember, ModifierName.not)) {
        return parsedMember;
    }
    /* istanbul ignore if */
    if (!isSpecificMember(parsedMember, ModifierName.resolves) &&
        !isSpecificMember(parsedMember, ModifierName.rejects)) {
        // ts doesn't think that the ModifierName.not check is the direct inverse as the above two checks
        // todo: impossible at runtime, but can't be typed w/o negation support
        throw new Error("modifier name must be either \"" + ModifierName.resolves + "\" or \"" + ModifierName.rejects + "\" (got \"" + parsedMember.name + "\")");
    }
    var negation = parsedMember.node.parent &&
        exports.isExpectMember(parsedMember.node.parent, ModifierName.not)
        ? parsedMember.node.parent
        : undefined;
    return __assign(__assign({}, parsedMember), { negation: negation });
};
var isSpecificMember = function (member, specific) { return member.name === specific; };
/**
 * Checks if the given `ParsedExpectMember` should be re-parsed as an `ParsedExpectModifier`.
 *
 * @param {ParsedExpectMember} member
 *
 * @return {member is ParsedExpectMember<ModifierName>}
 */
var shouldBeParsedExpectModifier = function (member) {
    return ModifierName.hasOwnProperty(member.name);
};
var parseExpectCall = function (expect) {
    var expectation = {
        expect: expect
    };
    if (!exports.isExpectMember(expect.parent)) {
        return expectation;
    }
    var parsedMember = parseExpectMember(expect.parent);
    if (!shouldBeParsedExpectModifier(parsedMember)) {
        expectation.matcher = reparseAsMatcher(parsedMember);
        return expectation;
    }
    var modifier = (expectation.modifier =
        reparseMemberAsModifier(parsedMember));
    var memberNode = modifier.negation || modifier.node;
    if (!memberNode.parent || !exports.isExpectMember(memberNode.parent)) {
        return expectation;
    }
    expectation.matcher = reparseAsMatcher(parseExpectMember(memberNode.parent));
    return expectation;
};
exports.parseExpectCall = parseExpectCall;
var DescribeAlias;
(function (DescribeAlias) {
    DescribeAlias["describe"] = "describe";
    DescribeAlias["fdescribe"] = "fdescribe";
    DescribeAlias["xdescribe"] = "xdescribe";
})(DescribeAlias = exports.DescribeAlias || (exports.DescribeAlias = {}));
var TestCaseName;
(function (TestCaseName) {
    TestCaseName["fit"] = "fit";
    TestCaseName["it"] = "it";
    TestCaseName["test"] = "test";
    TestCaseName["xit"] = "xit";
    TestCaseName["xtest"] = "xtest";
})(TestCaseName = exports.TestCaseName || (exports.TestCaseName = {}));
var HookName;
(function (HookName) {
    HookName["beforeAll"] = "beforeAll";
    HookName["beforeEach"] = "beforeEach";
    HookName["afterAll"] = "afterAll";
    HookName["afterEach"] = "afterEach";
})(HookName = exports.HookName || (exports.HookName = {}));
var DescribeProperty;
(function (DescribeProperty) {
    DescribeProperty["each"] = "each";
    DescribeProperty["only"] = "only";
    DescribeProperty["skip"] = "skip";
})(DescribeProperty = exports.DescribeProperty || (exports.DescribeProperty = {}));
var TestCaseProperty;
(function (TestCaseProperty) {
    TestCaseProperty["each"] = "each";
    TestCaseProperty["concurrent"] = "concurrent";
    TestCaseProperty["only"] = "only";
    TestCaseProperty["skip"] = "skip";
    TestCaseProperty["todo"] = "todo";
})(TestCaseProperty = exports.TestCaseProperty || (exports.TestCaseProperty = {}));
var joinNames = function (a, b) {
    return a && b ? a + "." + b : null;
};
function getNodeName(node) {
    if (exports.isSupportedAccessor(node)) {
        return exports.getAccessorValue(node);
    }
    switch (node.type) {
        case experimental_utils_1.AST_NODE_TYPES.TaggedTemplateExpression:
            return getNodeName(node.tag);
        case experimental_utils_1.AST_NODE_TYPES.MemberExpression:
            return joinNames(getNodeName(node.object), getNodeName(node.property));
        case experimental_utils_1.AST_NODE_TYPES.NewExpression:
        case experimental_utils_1.AST_NODE_TYPES.CallExpression:
            return getNodeName(node.callee);
    }
    return null;
}
exports.getNodeName = getNodeName;
var isFunction = function (node) {
    return node.type === experimental_utils_1.AST_NODE_TYPES.FunctionExpression ||
        node.type === experimental_utils_1.AST_NODE_TYPES.ArrowFunctionExpression;
};
exports.isFunction = isFunction;
var isHook = function (node) {
    return node.callee.type === experimental_utils_1.AST_NODE_TYPES.Identifier &&
        HookName.hasOwnProperty(node.callee.name);
};
exports.isHook = isHook;
var getTestCallExpressionsFromDeclaredVariables = function (declaredVariables) {
    return declaredVariables.reduce(function (acc, _a) {
        var references = _a.references;
        return acc.concat(references
            .map(function (_a) {
            var identifier = _a.identifier;
            return identifier.parent;
        })
            .filter(function (node) {
            return !!node &&
                node.type === experimental_utils_1.AST_NODE_TYPES.CallExpression &&
                exports.isTestCaseCall(node);
        }));
    }, []);
};
exports.getTestCallExpressionsFromDeclaredVariables = getTestCallExpressionsFromDeclaredVariables;
var isTestCaseName = function (node) {
    return node.type === experimental_utils_1.AST_NODE_TYPES.Identifier &&
        TestCaseName.hasOwnProperty(node.name);
};
var isTestCaseProperty = function (node) {
    return exports.isSupportedAccessor(node) &&
        TestCaseProperty.hasOwnProperty(exports.getAccessorValue(node));
};
/**
 * Checks if the given `node` is a *call* to a test case function that would
 * result in tests being run by `jest`.
 *
 * Note that `.each()` does not count as a call in this context, as it will not
 * result in `jest` running any tests.
 *
 * @param {TSESTree.CallExpression} node
 *
 * @return {node is JestFunctionCallExpression<TestCaseName>}
 */
var isTestCaseCall = function (node) {
    if (isTestCaseName(node.callee)) {
        return true;
    }
    var callee = node.callee.type === experimental_utils_1.AST_NODE_TYPES.TaggedTemplateExpression
        ? node.callee.tag
        : node.callee.type === experimental_utils_1.AST_NODE_TYPES.CallExpression
            ? node.callee.callee
            : node.callee;
    if (callee.type === experimental_utils_1.AST_NODE_TYPES.MemberExpression &&
        isTestCaseProperty(callee.property)) {
        // if we're an `each()`, ensure we're the outer CallExpression (i.e `.each()()`)
        if (exports.getAccessorValue(callee.property) === 'each' &&
            node.callee.type !== experimental_utils_1.AST_NODE_TYPES.TaggedTemplateExpression &&
            node.callee.type !== experimental_utils_1.AST_NODE_TYPES.CallExpression) {
            return false;
        }
        return callee.object.type === experimental_utils_1.AST_NODE_TYPES.MemberExpression
            ? isTestCaseName(callee.object.object)
            : isTestCaseName(callee.object);
    }
    return false;
};
exports.isTestCaseCall = isTestCaseCall;
var isDescribeAlias = function (node) {
    return node.type === experimental_utils_1.AST_NODE_TYPES.Identifier &&
        DescribeAlias.hasOwnProperty(node.name);
};
var isDescribeProperty = function (node) {
    return exports.isSupportedAccessor(node) &&
        DescribeProperty.hasOwnProperty(exports.getAccessorValue(node));
};
/**
 * Checks if the given `node` is a *call* to a `describe` function that would
 * result in a `describe` block being created by `jest`.
 *
 * Note that `.each()` does not count as a call in this context, as it will not
 * result in `jest` creating any `describe` blocks.
 *
 * @param {TSESTree.CallExpression} node
 *
 * @return {node is JestFunctionCallExpression<TestCaseName>}
 */
var isDescribeCall = function (node) {
    if (isDescribeAlias(node.callee)) {
        return true;
    }
    var callee = node.callee.type === experimental_utils_1.AST_NODE_TYPES.TaggedTemplateExpression
        ? node.callee.tag
        : node.callee.type === experimental_utils_1.AST_NODE_TYPES.CallExpression
            ? node.callee.callee
            : node.callee;
    if (callee.type === experimental_utils_1.AST_NODE_TYPES.MemberExpression &&
        isDescribeProperty(callee.property)) {
        // if we're an `each()`, ensure we're the outer CallExpression (i.e `.each()()`)
        if (exports.getAccessorValue(callee.property) === 'each' &&
            node.callee.type !== experimental_utils_1.AST_NODE_TYPES.TaggedTemplateExpression &&
            node.callee.type !== experimental_utils_1.AST_NODE_TYPES.CallExpression) {
            return false;
        }
        return callee.object.type === experimental_utils_1.AST_NODE_TYPES.MemberExpression
            ? isDescribeAlias(callee.object.object)
            : isDescribeAlias(callee.object);
    }
    return false;
};
exports.isDescribeCall = isDescribeCall;
var collectReferences = function (scope) {
    var locals = new Set();
    var unresolved = new Set();
    var currentScope = scope;
    while (currentScope !== null) {
        for (var _i = 0, _a = currentScope.variables; _i < _a.length; _i++) {
            var ref = _a[_i];
            var isReferenceDefined = ref.defs.some(function (def) {
                return def.type !== 'ImplicitGlobalVariable';
            });
            if (isReferenceDefined) {
                locals.add(ref.name);
            }
        }
        for (var _b = 0, _c = currentScope.through; _b < _c.length; _b++) {
            var ref = _c[_b];
            unresolved.add(ref.identifier.name);
        }
        currentScope = currentScope.upper;
    }
    return { locals: locals, unresolved: unresolved };
};
var scopeHasLocalReference = function (scope, referenceName) {
    var references = collectReferences(scope);
    return (
    // referenceName was found as a local variable or function declaration.
    references.locals.has(referenceName) ||
        // referenceName was not found as an unresolved reference,
        // meaning it is likely not an implicit global reference.
        !references.unresolved.has(referenceName));
};
exports.scopeHasLocalReference = scopeHasLocalReference;
