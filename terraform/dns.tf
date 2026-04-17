################################################################################
# Route53 Hosted Zone + Records
################################################################################

module "route53" {
  source  = "terraform-aws-modules/route53/aws//modules/zones"
  version = "~> 4.0"

  zones = {
    (local.domain_name) = {
      comment = "Managed by Terraform"
    }
  }
}

module "route53_records" {
  source  = "terraform-aws-modules/route53/aws//modules/records"
  version = "~> 4.0"

  zone_id = module.route53.route53_zone_zone_id[local.domain_name]

  records = [
    # Apex A → CloudFront
    {
      name = ""
      type = "A"
      alias = {
        name                   = module.cloudfront.cloudfront_distribution_domain_name
        zone_id                = module.cloudfront.cloudfront_distribution_hosted_zone_id
        evaluate_target_health = false
      }
    },
    # Apex AAAA → CloudFront
    {
      name = ""
      type = "AAAA"
      alias = {
        name                   = module.cloudfront.cloudfront_distribution_domain_name
        zone_id                = module.cloudfront.cloudfront_distribution_hosted_zone_id
        evaluate_target_health = false
      }
    },
    # WWW → CloudFront
    {
      name    = "www"
      type    = "CNAME"
      ttl     = 3600
      records = [module.cloudfront.cloudfront_distribution_domain_name]
    },
    # MX
    {
      name    = ""
      type    = "MX"
      ttl     = 300
      records = ["1 smtp.google.com"]
    },
    # Root TXT (SPF, verifications)
    {
      name = ""
      type = "TXT"
      ttl  = 300
      records = [
        "keybase-site-verification=JztZiJilN0PzYVVznQTMrJpgFAucHTzCh4pClsaaEYU",
        "google-site-verification=oV1Ld2NHHV8sDrOs7D7yB0K87OiDESs-mN-QY_Yiwjc",
        "v=spf1 include:_spf.google.com ~all",
      ]
    },
    # DMARC
    {
      name    = "_dmarc"
      type    = "TXT"
      ttl     = 300
      records = ["v=DMARC1; p=reject; rua=mailto:postmaster@agusgonzaleznic.com,mailto:dmarc@agusgonzaleznic.com; pct=100; adkim=r; aspf=r"]
    },
    # DKIM - default selector
    {
      name = "default._domainkey"
      type = "TXT"
      ttl  = 300
      records = [
        "v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqlshAhDhUYp8p7/JHZo1YKmLXw/LGg5JshiF0FH67rBYfRcoqLskikW660n0/maHV5V+2xpVqmDH6PS5Rfl3mMVzH3TmLwn55+\"  \"YLpsu2uvtLjbcXvhn7RKmIbWG0T6AP9hSw0WusZDRXpLoMQvx10dr0Kh3i56FOeZY1Fs90yLA33Wa5gA/LDBdAN8zWTGU0TCjgaCwEoTpMIsI7Bdu9GzcVqtu3i0atlwRGRm5iHWoozFWW+b5C8WcanfOXF5PIQQ7m7T9HXU84EAmngnnXwVyqT8wtkMDEhdiM1Oviz2xZ7IsuVITDPkG31JoRG/zxY54ahBreeh+zhsl7sRddMwIDAQAB"
      ]
    },
    # DKIM - google selector
    {
      name = "google._domainkey"
      type = "TXT"
      ttl  = 300
      records = [
        "v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqlshAhDhUYp8p7/JHZo1YKmLXw/LGg5JshiF0FH67rBYfRcoqLskikW660n0/maHV5V+2xpVqmDH6PS5Rfl3mMVzH3TmLwn55+\" \"YLpsu2uvtLjbcXvhn7RKmIbWG0T6AP9hSw0WusZDRXpLoMQvx10dr0Kh3i56FOeZY1Fs90yLA33Wa5gA/LDBdAN8zWTGU0TCjgaCwEoTpMIsI7Bdu9GzcVqtu3i0atlwRGRm5iHWoozFWW+b5C8WcanfOXF5PIQQ7m7T9HXU84EAmngnnXwVyqT8wtkMDEhdiM1Oviz2xZ7IsuVITDPkG31JoRG/zxY54ahBreeh+zhsl7sRddMwIDAQAB"
      ]
    },
    # MTA-STS TXT
    {
      name    = "_mta-sts"
      type    = "TXT"
      ttl     = 300
      records = ["v=STSv1;id=1744722000;"]
    },
    # SMTP TLS reporting
    {
      name    = "_smtp._tls"
      type    = "TXT"
      ttl     = 300
      records = ["v=TLSRPTv1;rua=mailto:smtp-tls-reports@agusgonzaleznic.com;"]
    },
    # MTA-STS CNAME
    {
      name    = "mta-sts"
      type    = "CNAME"
      ttl     = 300
      records = ["agusgonzaleznic.github.io"]
    },
    # CAA
    {
      name = ""
      type = "CAA"
      ttl  = 300
      records = [
        "0 issue \"amazon.com\"",
        "0 issue \"amazontrust.com\"",
        "0 issue \"awstrust.com\"",
        "0 issue \"amazonaws.com\"",
        "0 issuewild \"amazon.com\"",
        "0 issue \"letsencrypt.org\"",
        "0 issuewild \"letsencrypt.org\"",
      ]
    },
  ]
}
