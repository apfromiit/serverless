'use strict'

const expect = require('chai').expect
const sinon = require('sinon')
const AwsInfo = require('../../../../../../lib/plugins/aws/info/index')
const AwsProvider = require('../../../../../../lib/plugins/aws/provider')
const Serverless = require('../../../../../../lib/serverless')

describe('#getStackInfo()', () => {
  let serverless
  let awsInfo
  let describeStacksStub

  beforeEach(() => {
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    }
    serverless = new Serverless({ commands: [], options: {} })
    serverless.setProvider('aws', new AwsProvider(serverless, options))
    serverless.service.service = 'my-service'
    serverless.service.functions = {
      hello: { name: 'my-service-dev-hello' },
      world: { name: 'customized' },
    }
    serverless.service.layers = { test: {} }
    awsInfo = new AwsInfo(serverless, options)

    describeStacksStub = sinon.stub(awsInfo.provider, 'request')
  })

  afterEach(() => {
    awsInfo.provider.request.restore()
  })

  it('attach info from describeStack call to this.gatheredData if result is available', async () => {
    const describeStacksResponse = {
      Stacks: [
        {
          StackId:
            'arn:aws:cloudformation:us-east-1:123456789012:' +
            'stack/myteststack/466df9e0-0dff-08e3-8e2f-5088487c4896',
          Description:
            'AWS CloudFormation Sample Template S3_Bucket: ' +
            'Sample template showing how to create a publicly accessible S3 bucket.',
          Tags: [],
          Outputs: [
            {
              Description: 'URL of the service endpoint',
              OutputKey: 'ServiceEndpoint',
              OutputValue: 'ab12cd34ef.execute-api.us-east-1.amazonaws.com/dev',
            },
            {
              Description: 'first',
              OutputKey: 'ApiGatewayApiKey1Value',
              OutputValue: 'xxx',
            },
            {
              Description: 'second',
              OutputKey: 'ApiGatewayApiKey2Value',
              OutputValue: 'yyy',
            },
            {
              Description: 'Current Lambda layer version',
              OutputKey: 'TestLambdaLayerQualifiedArn',
              OutputValue: 'arn:aws:lambda:region:NNNNNNNNNNNN:layer:test:1',
            },
            {
              Description: 'CloudFront Distribution Id',
              OutputKey: 'CloudFrontDistribution',
              OutputValue: 'a12bcdef3g45hi',
            },
            {
              Description: 'CloudFront Distribution Domain Name',
              OutputKey: 'CloudFrontDistributionDomainName',
              OutputValue: 'a12bcdef3g45hi.cloudfront.net',
            },
          ],
          StackStatusReason: null,
          CreationTime: '2013-08-23T01:02:15.422Z',
          Capabilities: [],
          StackName: 'myteststack',
          StackStatus: 'CREATE_COMPLETE',
          DisableRollback: false,
        },
      ],
    }

    describeStacksStub.resolves(describeStacksResponse)

    const expectedGatheredDataObj = {
      info: {
        functions: [
          {
            name: 'hello',
            deployedName: 'my-service-dev-hello',
            artifactSize: undefined,
          },
          {
            name: 'world',
            deployedName: 'customized',
            artifactSize: undefined,
          },
        ],
        layers: [
          {
            name: 'test',
            arn: 'arn:aws:lambda:region:NNNNNNNNNNNN:layer:test:1',
          },
        ],

        endpoints: ['ab12cd34ef.execute-api.us-east-1.amazonaws.com/dev'],
        cloudFront: 'a12bcdef3g45hi.cloudfront.net',
        service: 'my-service',
        stage: 'dev',
        region: 'us-east-1',
        stack: 'my-service-dev',
      },
      outputs: [
        {
          Description: 'URL of the service endpoint',
          OutputKey: 'ServiceEndpoint',
          OutputValue: 'ab12cd34ef.execute-api.us-east-1.amazonaws.com/dev',
        },
        {
          Description: 'first',
          OutputKey: 'ApiGatewayApiKey1Value',
          OutputValue: 'xxx',
        },
        {
          Description: 'second',
          OutputKey: 'ApiGatewayApiKey2Value',
          OutputValue: 'yyy',
        },
        {
          Description: 'Current Lambda layer version',
          OutputKey: 'TestLambdaLayerQualifiedArn',
          OutputValue: 'arn:aws:lambda:region:NNNNNNNNNNNN:layer:test:1',
        },
        {
          Description: 'CloudFront Distribution Id',
          OutputKey: 'CloudFrontDistribution',
          OutputValue: 'a12bcdef3g45hi',
        },
        {
          Description: 'CloudFront Distribution Domain Name',
          OutputKey: 'CloudFrontDistributionDomainName',
          OutputValue: 'a12bcdef3g45hi.cloudfront.net',
        },
      ],
    }

    return awsInfo.getStackInfo().then(() => {
      expect(describeStacksStub.calledOnce).to.equal(true)
      expect(
        describeStacksStub.calledWithExactly(
          'CloudFormation',
          'describeStacks',
          {
            StackName: awsInfo.provider.naming.getStackName(),
          },
        ),
      ).to.equal(true)

      expect(awsInfo.gatheredData).to.deep.equal(expectedGatheredDataObj)
    })
  })

  it('should resolve if result is empty', async () => {
    const describeStacksResponse = null

    describeStacksStub.resolves(describeStacksResponse)

    const expectedGatheredDataObj = {
      info: {
        functions: [],
        layers: [],
        endpoints: [],
        service: 'my-service',
        stage: 'dev',
        region: 'us-east-1',
        stack: 'my-service-dev',
      },
      outputs: [],
    }

    return awsInfo.getStackInfo().then(() => {
      expect(describeStacksStub.calledOnce).to.equal(true)
      expect(
        describeStacksStub.calledWithExactly(
          'CloudFormation',
          'describeStacks',
          {
            StackName: awsInfo.provider.naming.getStackName(),
          },
        ),
      ).to.equal(true)

      expect(awsInfo.gatheredData).to.deep.equal(expectedGatheredDataObj)
    })
  })

  it('should attach info from api gateway if httpApi is used', async () => {
    serverless.service.provider.httpApi = {
      id: 'http-api-id',
    }

    describeStacksStub
      .withArgs('CloudFormation', 'describeStacks', {
        StackName: awsInfo.provider.naming.getStackName(),
      })
      .resolves(null)

    describeStacksStub
      .withArgs('ApiGatewayV2', 'getApi', {
        ApiId: 'http-api-id',
      })
      .resolves({
        ApiEndpoint: 'my-endpoint',
      })

    const expectedGatheredDataObj = {
      info: {
        functions: [],
        layers: [],
        endpoints: ['httpApi: my-endpoint'],
        service: 'my-service',
        stage: 'dev',
        region: 'us-east-1',
        stack: 'my-service-dev',
      },
      outputs: [],
    }

    return awsInfo.getStackInfo().then(() => {
      expect(describeStacksStub.calledTwice).to.equal(true)
      expect(
        describeStacksStub.calledWithExactly(
          'CloudFormation',
          'describeStacks',
          {
            StackName: awsInfo.provider.naming.getStackName(),
          },
        ),
      ).to.equal(true)
      expect(
        describeStacksStub.calledWithExactly('ApiGatewayV2', 'getApi', {
          ApiId: 'http-api-id',
        }),
      ).to.equal(true)

      expect(awsInfo.gatheredData).to.deep.equal(expectedGatheredDataObj)
    })
  })
})
