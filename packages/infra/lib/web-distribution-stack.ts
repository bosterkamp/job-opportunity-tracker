import { Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import {
  Distribution,
  HeadersFrameOption,
  HeadersReferrerPolicy,
  ResponseHeadersPolicy,
  ViewerProtocolPolicy,
} from 'aws-cdk-lib/aws-cloudfront';
import { S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { BlockPublicAccess, Bucket, BucketEncryption } from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';

// Where the browser may connect: this site, the API, and Cognito (the OIDC discovery document
// and keys from cognito-idp, the token endpoint on the managed-login domain). This stack can't
// name the exact API and Cognito hosts, because those stacks depend on it, so it allows those
// AWS services' hosts in this region.
export function contentSecurityPolicy(region: string): string {
  return [
    "default-src 'self'",
    `connect-src 'self' https://*.execute-api.${region}.amazonaws.com https://cognito-idp.${region}.amazonaws.com https://*.auth.${region}.amazoncognito.com`,
    "img-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

// The site bucket and CloudFront distribution. Deliberately depends on nothing else, so the
// auth and API stacks can use its URL without a circular dependency (research.md).
export class WebDistributionStack extends Stack {
  readonly bucket: Bucket;
  readonly distribution: Distribution;
  readonly siteUrl: string;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    // Only built web assets live here; they're redeployed on every release.
    this.bucket = new Bucket(this, 'SiteBucket', {
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const securityHeaders = new ResponseHeadersPolicy(this, 'SecurityHeaders', {
      securityHeadersBehavior: {
        strictTransportSecurity: {
          accessControlMaxAge: Duration.days(365),
          includeSubdomains: true,
          override: true,
        },
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: HeadersFrameOption.DENY, override: true },
        referrerPolicy: {
          referrerPolicy: HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: true,
        },
        contentSecurityPolicy: {
          contentSecurityPolicy: contentSecurityPolicy(this.region),
          override: true,
        },
      },
    });

    this.distribution = new Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(this.bucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        responseHeadersPolicy: securityHeaders,
      },
      defaultRootObject: 'index.html',
      // Single-page app: unknown paths like /archive are served index.html, and the
      // browser router takes over.
      errorResponses: [403, 404].map((httpStatus) => ({
        httpStatus,
        responseHttpStatus: 200,
        responsePagePath: '/index.html',
        ttl: Duration.seconds(0),
      })),
    });

    this.siteUrl = `https://${this.distribution.distributionDomainName}`;
  }
}
