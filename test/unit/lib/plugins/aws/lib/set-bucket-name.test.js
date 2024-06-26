'use strict'

const expect = require('chai').expect
const sinon = require('sinon')
const AwsProvider = require('../../../../../../lib/plugins/aws/provider')
const AwsDeploy = require('../../../../../../lib/plugins/aws/deploy/index')
const Serverless = require('../../../../../../lib/serverless')

describe('#setBucketName()', () => {
  let serverless
  let awsDeploy
  let getServerlessDeploymentBucketNameStub

  beforeEach(() => {
    serverless = new Serverless({ commands: [], options: {} })
    serverless.serviceDir = 'foo'
    const options = {
      stage: 'dev',
      region: 'us-east-1',
    }
    serverless.setProvider('aws', new AwsProvider(serverless, options))
    awsDeploy = new AwsDeploy(serverless, options)

    getServerlessDeploymentBucketNameStub = sinon
      .stub(awsDeploy.provider, 'getServerlessDeploymentBucketName')
      .resolves('bucket-name')
  })

  it('should store the name of the Serverless deployment bucket', async () =>
    awsDeploy.setBucketName().then(() => {
      expect(awsDeploy.bucketName).to.equal('bucket-name')
      expect(getServerlessDeploymentBucketNameStub.calledOnce).to.be.equal(true)
      expect(
        getServerlessDeploymentBucketNameStub.calledWithExactly(),
      ).to.be.equal(true)
      awsDeploy.provider.getServerlessDeploymentBucketName.restore()
    }))

  it('should resolve if the bucketName is already set', async () => {
    const bucketName = 'someBucket'
    awsDeploy.bucketName = bucketName
    return awsDeploy
      .setBucketName()
      .then(
        () =>
          expect(getServerlessDeploymentBucketNameStub.calledOnce).to.be.false,
      )
      .then(() => expect(awsDeploy.bucketName).to.equal(bucketName))
  })
})
