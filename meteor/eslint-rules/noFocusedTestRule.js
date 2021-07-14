"use strict";
exports.__esModule = true;
/** Based on https://github.com/jest-community/eslint-plugin-jest/blob/96031ecaab22a6550be0c9fc62fe96eec6bb0fff/src/rules/no-focused-tests.ts */
var experimental_utils_1 = require("@typescript-eslint/experimental-utils");
var utils_1 = require("./utils");
var findOnlyNode = function (node) {
    var callee = node.callee.type === experimental_utils_1.AST_NODE_TYPES.TaggedTemplateExpression
        ? node.callee.tag
        : node.callee.type === experimental_utils_1.AST_NODE_TYPES.CallExpression
            ? node.callee.callee
            : node.callee;
    if (callee.type === experimental_utils_1.AST_NODE_TYPES.MemberExpression) {
        if (callee.object.type === experimental_utils_1.AST_NODE_TYPES.MemberExpression) {
            if (utils_1.isSupportedAccessor(callee.object.property, 'only')) {
                return callee.object.property;
            }
        }
        if (utils_1.isSupportedAccessor(callee.property, 'only')) {
            return callee.property;
        }
    }
    return null;
};
exports["default"] = utils_1.createRule({
    name: __filename,
    meta: {
        docs: {
            category: 'Best Practices',
            description: 'Disallow focused tests',
            recommended: 'error',
            suggestion: true
        },
        messages: {
            focusedTest: 'Unexpected focused test.',
            suggestRemoveFocus: 'Remove focus from test.'
        },
        schema: [],
        type: 'suggestion'
    },
    defaultOptions: [],
    create: function (context) { return ({
        CallExpression: function (node) {
            if (node.callee.type === experimental_utils_1.AST_NODE_TYPES.Identifier && node.callee.name === 'testInFiberOnly') {
                context.report({
                    messageId: 'focusedTest',
                    node: node,
                    suggest: [
                        {
                            messageId: 'suggestRemoveFocus',
                            fix: function (fixer) {
                                return fixer.removeRange([node.range[0], node.range[0] + 1]);
                            }
                        },
                    ]
                });
                return;
            }
            if (!utils_1.isDescribeCall(node) && !utils_1.isTestCaseCall(node)) {
                return;
            }
            if (utils_1.getNodeName(node).startsWith('f')) {
                context.report({
                    messageId: 'focusedTest',
                    node: node,
                    suggest: [
                        {
                            messageId: 'suggestRemoveFocus',
                            fix: function (fixer) {
                                return fixer.removeRange([node.range[0], node.range[0] + 1]);
                            }
                        },
                    ]
                });
                return;
            }
            var onlyNode = findOnlyNode(node);
            if (!onlyNode) {
                return;
            }
            context.report({
                messageId: 'focusedTest',
                node: onlyNode,
                suggest: [
                    {
                        messageId: 'suggestRemoveFocus',
                        fix: function (fixer) {
                            return fixer.removeRange([
                                onlyNode.range[0] - 1,
                                onlyNode.range[1] +
                                    Number(onlyNode.type !== experimental_utils_1.AST_NODE_TYPES.Identifier),
                            ]);
                        }
                    },
                ]
            });
        }
    }); }
});
