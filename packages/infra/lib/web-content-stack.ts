import { CfnOutput, Stack, type StackProps } from 'aws-cdk-lib';
import type { Distribution } from 'aws-cdk-lib/aws-cloudfront';
import type { Bucket } from 'aws-cdk-lib/aws-s3';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import type { Construct } from 'constructs';

// The runtime settings the web app reads from /config.json (packages/web/src/config.ts).
export interface WebRuntimeConfig {
  appEnv: 'aws';
  apiUrl: string;
  cognitoAuthority: string;
  cognitoClientId: string;
  redirectUri: string;
}

export interface WebContentStackProps extends StackProps {
  bucket: Bucket;
  distribution: Distribution;
  siteUrl: string;
  // Folder with the built web app (packages/web/dist).
  webDistPath: string;
  config: WebRuntimeConfig;
}

// Deployed last: uploads the built app plus config.json, which carries the API URL and
// Cognito settings, so the web build itself never needs them (research.md).
export class WebContentStack extends Stack {
  readonly config: WebRuntimeConfig;

  constructor(scope: Construct, id: string, props: WebContentStackProps) {
    super(scope, id, props);
    this.config = props.config;

    new BucketDeployment(this, 'SiteDeployment', {
      sources: [Source.asset(props.webDistPath), Source.jsonData('config.json', props.config)],
      destinationBucket: props.bucket,
      distribution: props.distribution,
      distributionPaths: ['/*'],
      prune: true,
    });

    new CfnOutput(this, 'SiteUrl', {
      value: props.siteUrl,
      description: 'Job tracker web app URL',
    });
  }
}
